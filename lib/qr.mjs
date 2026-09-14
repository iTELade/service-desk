// Minimal QR Code Model 2 encoder for the otpauth:// URI used by Service Desk.
// Fixed at version 8-L (49x49), which safely fits the generated TOTP URI.
// No external service sees the MFA secret.
const SIZE=49, VERSION=8, DATA_CODEWORDS=194, ECC_PER_BLOCK=24;
const ALIGN=[6,24,42];

const gfExp=new Uint8Array(512),gfLog=new Uint8Array(256);
{let x=1;for(let i=0;i<255;i++){gfExp[i]=x;gfLog[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)gfExp[i]=gfExp[i-255];}
const mul=(a,b)=>a&&b?gfExp[gfLog[a]+gfLog[b]]:0;
function generator(degree){let p=[1];for(let i=0;i<degree;i++){const next=new Array(p.length+1).fill(0),r=gfExp[i];for(let j=0;j<p.length;j++){next[j]^=p[j];next[j+1]^=mul(p[j],r);}p=next;}return p;}
const GEN=generator(ECC_PER_BLOCK);
function ecc(data){const out=new Array(ECC_PER_BLOCK).fill(0);for(const v of data){const factor=v^out[0];out.shift();out.push(0);for(let i=0;i<ECC_PER_BLOCK;i++)out[i]^=mul(GEN[i+1],factor);}return out;}

function bitsPush(bits,value,count){for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1);}
function codewords(text){
  const bytes=[...new TextEncoder().encode(text)];
  if(bytes.length>190)throw new Error('QR payload is too long.');
  const bits=[];bitsPush(bits,0b0100,4);bitsPush(bits,bytes.length,8);for(const b of bytes)bitsPush(bits,b,8);
  for(let i=0;i<Math.min(4,DATA_CODEWORDS*8-bits.length);i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|(bits[i+j]||0);data.push(v);}
  let pad=0;while(data.length<DATA_CODEWORDS)data.push(pad++%2?0x11:0xec);
  const blocks=[data.slice(0,97),data.slice(97,194)],checks=blocks.map(ecc),out=[];
  for(let i=0;i<97;i++)for(const b of blocks)out.push(b[i]);
  for(let i=0;i<ECC_PER_BLOCK;i++)for(const b of checks)out.push(b[i]);
  return out;
}
function bchFormat(value){let d=value<<10,g=0x537;while((31-Math.clz32(d))-(31-Math.clz32(g))>=0)d^=g<<((31-Math.clz32(d))-(31-Math.clz32(g)));return ((value<<10)|d)^0x5412;}
function bchVersion(value){let d=value<<12,g=0x1f25;while((31-Math.clz32(d))-(31-Math.clz32(g))>=0)d^=g<<((31-Math.clz32(d))-(31-Math.clz32(g)));return (value<<12)|d;}
function maskBit(mask,r,c){return [
  (r+c)%2===0,r%2===0,c%3===0,(r+c)%3===0,(Math.floor(r/2)+Math.floor(c/3))%2===0,
  (r*c)%2+(r*c)%3===0,((r*c)%2+(r*c)%3)%2===0,((r*c)%3+(r+c)%2)%2===0
][mask];}
function blank(){
  const m=Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  const fixed=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
  const set=(r,c,v)=>{if(r>=0&&c>=0&&r<SIZE&&c<SIZE){m[r][c]=Boolean(v);fixed[r][c]=true;}};
  const finder=(row,col)=>{
    for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=row+r,cc=col+c;if(rr<0||cc<0||rr>=SIZE||cc>=SIZE)continue;const on=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));set(rr,cc,on);}
  };
  finder(0,0);finder(SIZE-7,0);finder(0,SIZE-7);
  for(const r of ALIGN)for(const c of ALIGN){
    if((r===6&&c===6)||(r===6&&c===42)||(r===42&&c===6))continue;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)set(r+dr,c+dc,Math.max(Math.abs(dr),Math.abs(dc))!==1);
  }
  for(let i=8;i<SIZE-8;i++){if(m[i][6]===null)set(i,6,i%2===0);if(m[6][i]===null)set(6,i,i%2===0);}
  // Reserve format info areas.
  for(let i=0;i<15;i++){
    let r,c;
    if(i<6){r=i;c=8;}else if(i<8){r=i+1;c=8;}else{r=SIZE-15+i;c=8;}set(r,c,false);
    if(i<8){r=8;c=SIZE-i-1;}else if(i<9){r=8;c=15-i;}else{r=8;c=15-i-1;}set(r,c,false);
  }
  set(SIZE-8,8,true);
  // Version information (version >= 7).
  for(let i=0;i<18;i++){set(Math.floor(i/3),i%3+SIZE-11,false);set(i%3+SIZE-11,Math.floor(i/3),false);}
  return {m,fixed,set};
}
function fillFormat(m,fixed,mask){
  const bits=bchFormat((1<<3)|mask); // L = 01
  const set=(r,c,v)=>{m[r][c]=Boolean(v);fixed[r][c]=true;};
  for(let i=0;i<15;i++){
    const v=((bits>>>i)&1)!==0;
    if(i<6)set(i,8,v);else if(i<8)set(i+1,8,v);else set(SIZE-15+i,8,v);
    if(i<8)set(8,SIZE-i-1,v);else if(i<9)set(8,15-i,v);else set(8,15-i-1,v);
  }
  set(SIZE-8,8,true);
  const ver=bchVersion(VERSION);
  for(let i=0;i<18;i++){const v=((ver>>>i)&1)!==0;set(Math.floor(i/3),i%3+SIZE-11,v);set(i%3+SIZE-11,Math.floor(i/3),v);}
}
function build(text,mask){
  const {m,fixed}=blank(),cw=codewords(text),dataBits=[];for(const b of cw)bitsPush(dataBits,b,8);
  let bit=0,up=true;
  for(let col=SIZE-1;col>0;col-=2){
    if(col===6)col--;
    for(let n=0;n<SIZE;n++){
      const row=up?SIZE-1-n:n;
      for(let k=0;k<2;k++){const c=col-k;if(fixed[row][c])continue;let v=bit<dataBits.length?dataBits[bit++]:0;if(maskBit(mask,row,c))v^=1;m[row][c]=Boolean(v);}
    }
    up=!up;
  }
  fillFormat(m,fixed,mask);
  return m;
}
function penalty(m){
  let score=0;
  for(let r=0;r<SIZE;r++){let run=1;for(let c=1;c<SIZE;c++){if(m[r][c]===m[r][c-1]){run++;if(run===5)score+=3;else if(run>5)score++;}else run=1;}}
  for(let c=0;c<SIZE;c++){let run=1;for(let r=1;r<SIZE;r++){if(m[r][c]===m[r-1][c]){run++;if(run===5)score+=3;else if(run>5)score++;}else run=1;}}
  for(let r=0;r<SIZE-1;r++)for(let c=0;c<SIZE-1;c++){const v=m[r][c];if(m[r+1][c]===v&&m[r][c+1]===v&&m[r+1][c+1]===v)score+=3;}
  const p=[true,false,true,true,true,false,true,false,false,false,false];
  for(let r=0;r<SIZE;r++)for(let c=0;c<=SIZE-11;c++){let ok=true;for(let i=0;i<11;i++)if(m[r][c+i]!==p[i]){ok=false;break;}if(ok)score+=40;}
  for(let c=0;c<SIZE;c++)for(let r=0;r<=SIZE-11;r++){let ok=true;for(let i=0;i<11;i++)if(m[r+i][c]!==p[i]){ok=false;break;}if(ok)score+=40;}
  let dark=0;for(const row of m)for(const v of row)if(v)dark++;score+=Math.floor(Math.abs(dark*100/(SIZE*SIZE)-50)/5)*10;
  return score;
}
export function qrSvg(text){
  let best=null,bestScore=Infinity;
  for(let mask=0;mask<8;mask++){const m=build(text,mask),s=penalty(m);if(s<bestScore){bestScore=s;best=m;}}
  const q=4,scale=5,dim=(SIZE+q*2)*scale,rects=[];
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(best[r][c])rects.push(`<rect x="${(c+q)*scale}" y="${(r+q)*scale}" width="${scale}" height="${scale}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code for authenticator setup" viewBox="0 0 ${dim} ${dim}" width="285" height="285"><rect width="100%" height="100%" fill="white"/><g fill="black">${rects.join('')}</g></svg>`;
}
