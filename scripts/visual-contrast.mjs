// Runs inside Chromium through page.evaluate; includes inherited and translucent surfaces.
export function inspectTextContrast() {
  const rgba = value => {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
    return [...channels.slice(0, 3), channels[3] ?? 1];
  };
  const over = (foreground, background) => {
    const alpha = foreground[3] + background[3] * (1 - foreground[3]);
    return [...foreground.slice(0, 3).map((v, i) => alpha ?
      (v * foreground[3] + background[i] * background[3] * (1 - foreground[3])) / alpha : 0), alpha];
  };
  const luminance = color => {
    const v = color.slice(0, 3).map(x => (x /= 255) <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
  };
  const failures = [];
  for (const element of document.querySelectorAll('body *')) {
    if (element.closest('svg,script,style,option,[hidden]') || element.matches(':disabled') || !element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    let text = [...element.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
    const field = element.matches('textarea,select,input:not([type]),input[type=text],input[type=email],input[type=password],input[type=search],input[type=url],input[type=tel],input[type=number]');
    const placeholder = field && !element.value && element.placeholder;
    if (field) text = element.tagName === 'SELECT' ? element.selectedOptions[0]?.textContent : element.value || placeholder;
    if (!text) continue;
    const style = getComputedStyle(element, placeholder ? '::placeholder' : null);
    if (style.backgroundImage !== 'none') continue; // Raster/gradient contrast requires separate visual inspection.
    let background = [0, 0, 0, 0];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      background = over(background, rgba(getComputedStyle(ancestor).backgroundColor));
      if (background[3] >= .999) break;
    }
    background = over(background, [255, 255, 255, 1]);
    const textColor = rgba(style.color);
    textColor[3] *= Number(style.opacity);
    const foreground = over(textColor, background);
    const a = luminance(foreground), b = luminance(background);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const size = parseFloat(style.fontSize), weight = parseInt(style.fontWeight, 10);
    const required = size >= 24 || size >= 18.66 && weight >= 700 ? 3 : 4.5;
    if (ratio + .01 < required) failures.push({tag:element.tagName,classes:element.className,text:text.slice(0,100),color:style.color,background:background.slice(0,3).map(Math.round),ratio:+ratio.toFixed(2),required});
  }
  return failures;
}
