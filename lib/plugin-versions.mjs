export function validPluginVersion(value) {
  if (typeof value !== 'string' || value.length > 64 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) return false;
  return !(value.split('-').slice(1).join('-').split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')));
}
export function comparePluginVersions(a, b) {
  if (!validPluginVersion(a) || !validPluginVersion(b)) throw Error('Invalid plugin version.');
  const parts = value => { const index = value.indexOf('-'); return [value.slice(0,index<0?undefined:index).split('.').map(BigInt),index<0?null:value.slice(index+1).split('.')]; };
  const [coreA,preA]=parts(a),[coreB,preB]=parts(b);
  for(let i=0;i<3;i++)if(coreA[i]!==coreB[i])return coreA[i]>coreB[i]?1:-1;
  if(preA===null||preB===null)return preA===preB?0:preA===null?1:-1;
  for(let i=0;i<Math.max(preA.length,preB.length);i++){
    if(preA[i]===undefined||preB[i]===undefined)return preA[i]===undefined?-1:1;
    if(preA[i]===preB[i])continue;
    const numericA=/^\d+$/.test(preA[i]),numericB=/^\d+$/.test(preB[i]);
    if(numericA&&numericB)return BigInt(preA[i])>BigInt(preB[i])?1:-1;
    if(numericA!==numericB)return numericA?-1:1;
    return preA[i]>preB[i]?1:-1;
  }
  return 0;
}
