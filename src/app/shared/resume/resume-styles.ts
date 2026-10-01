/**
 * Styles for the resume renderer. Kept as a plain string so the exact same CSS
 * is used on screen and inside the HTML sent to the PDF engine.
 */
export const RESUME_CSS = `
.rz{--rz-primary:#1e3a8a;--rz-accent:#3b82f6;--rz-text:#1f2937;--rz-muted:#6b7280;--rz-bg:#fff;--rz-side-bg:#1e3a8a;--rz-side-text:#fff;--rz-side-head:#fff;--rz-side-accent:#fff;--rz-hfont:Inter,Arial,sans-serif;--rz-bfont:Inter,Arial,sans-serif;--rz-fs:10.5pt;--rz-lh:1.45;--rz-m:16mm;--rz-gap:14pt;--rz-side-w:32%;
position:relative;box-sizing:border-box;width:210mm;min-height:297mm;padding:var(--rz-m);background:var(--rz-bg);color:var(--rz-text);font-family:var(--rz-bfont);font-size:var(--rz-fs);line-height:var(--rz-lh);text-align:left;overflow-wrap:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-kerning:normal;font-weight:400;letter-spacing:normal}
.rz *,.rz *::before,.rz *::after{box-sizing:border-box;margin:0;padding:0}
.rz.rz-letter{width:215.9mm;min-height:279.4mm}
.rz a{color:inherit;text-decoration:none}
.rz ul{list-style:none}
.rz .rz-ph{opacity:.4}
.rz-p{white-space:pre-line}

.rz-header{display:flex;align-items:center;gap:1.3em;margin-bottom:calc(var(--rz-gap) * 1.05)}
.rz-htext{flex:1;min-width:0}
.rz-name{font-family:var(--rz-hfont);font-size:2.3em;font-weight:700;line-height:1.08;color:var(--rz-primary);letter-spacing:-.015em}
.rz-title{margin-top:.28em;font-size:1.12em;font-weight:500;color:var(--rz-text);opacity:.85}
.rz-contact{display:flex;flex-wrap:wrap;gap:.3em 1.1em;margin-top:.7em;font-size:.88em;color:var(--rz-muted)}
.rz-ci{display:inline-flex;align-items:center;gap:.42em;min-width:0}
.rz-ci svg{width:1.05em;height:1.05em;flex-shrink:0;stroke:var(--rz-accent);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.rz-noicons .rz-ci svg{display:none}
.rz-noicons .rz-contact{column-gap:0}
.rz-noicons .rz-contact .rz-ci+.rz-ci::before{content:'|';margin:0 .65em;opacity:.45}
.rz-photo{display:block;width:27mm;height:27mm;object-fit:cover;flex-shrink:0;border-radius:50%}
.rz-ps-rounded .rz-photo{border-radius:14%}
.rz-ps-square .rz-photo{border-radius:0}
.rz-center .rz-header{flex-direction:column;text-align:center;gap:.8em}
.rz-center .rz-contact{justify-content:center}

.rz-sec{margin-top:var(--rz-gap)}
.rz-sec:first-child{margin-top:0}
.rz-h{font-family:var(--rz-hfont);font-size:1.13em;font-weight:700;line-height:1.25;color:var(--rz-primary);margin-bottom:.6em;break-after:avoid;page-break-after:avoid}
.rz-upper .rz-h{text-transform:uppercase;letter-spacing:.09em;font-size:.98em}
.rz-hs-line .rz-h{padding-bottom:.3em;border-bottom:1px solid color-mix(in srgb,var(--rz-primary) 35%,transparent)}
.rz-hs-underline .rz-h::after{content:'';display:block;width:2.4em;height:3px;margin-top:.35em;border-radius:2px;background:var(--rz-accent)}
.rz-hs-bar .rz-h{padding-left:.6em;border-left:3.5px solid var(--rz-accent)}
.rz-hs-boxed .rz-h{display:block;width:fit-content;padding:.22em .75em;border-radius:4px;background:var(--rz-primary);color:#fff}
.rz-hs-dot .rz-h{display:flex;align-items:center;gap:.5em}
.rz-hs-dot .rz-h::before{content:'';width:.6em;height:.6em;border-radius:50%;background:var(--rz-accent);flex-shrink:0}
.rz-hs-double .rz-h{padding-bottom:.25em;border-bottom:3px double color-mix(in srgb,var(--rz-primary) 55%,transparent)}

.rz-entry{break-inside:avoid;page-break-inside:avoid}
.rz-entry+.rz-entry{margin-top:.85em}
.rz-ehead{display:flex;justify-content:space-between;align-items:baseline;gap:.9em}
.rz-emain{min-width:0}
.rz-etitle{font-weight:700;font-size:1.03em;color:var(--rz-text)}
.rz-esub{font-weight:600;color:color-mix(in srgb,var(--rz-primary) 78%,var(--rz-text))}
.rz-loc{font-weight:400;color:var(--rz-muted)}
.rz-emeta{flex-shrink:0;font-size:.88em;color:var(--rz-muted);white-space:nowrap;text-align:right}
.rz-edesc{margin-top:.3em;white-space:pre-line}
.rz-bul{margin-top:.3em;padding-left:1.1em}
.rz-bul li{margin-top:.14em;padding-left:.15em}
.rz-bs-disc .rz-bul{list-style:disc}
.rz-bs-square .rz-bul{list-style:square}
.rz-bul li::marker{color:var(--rz-accent)}
.rz-bs-dash .rz-bul,.rz-bs-arrow .rz-bul,.rz-bs-check .rz-bul,.rz-bs-none .rz-bul{list-style:none;padding-left:0}
.rz-bs-dash .rz-bul li,.rz-bs-arrow .rz-bul li,.rz-bs-check .rz-bul li{position:relative;padding-left:1.05em}
.rz-bs-dash .rz-bul li::before,.rz-bs-arrow .rz-bul li::before,.rz-bs-check .rz-bul li::before{position:absolute;left:0;top:0;color:var(--rz-accent);font-weight:700}
.rz-bs-dash .rz-bul li::before{content:'\\2013'}
.rz-bs-arrow .rz-bul li::before{content:'\\203A';font-size:1.2em;line-height:1.05}
.rz-bs-check .rz-bul li::before{content:'\\2713';font-size:.9em}

.rz-items{display:flex;flex-direction:column;gap:.4em}
.rz-item{display:flex;justify-content:space-between;align-items:baseline;gap:.8em;break-inside:avoid}
.rz-item b{font-weight:600}
.rz-item-sub{color:var(--rz-muted)}
.rz-langs{display:flex;flex-wrap:wrap;gap:.35em 1.5em}
.rz-lang b{font-weight:600}
.rz-lang span{color:var(--rz-muted)}

.rz-sk-tags{display:flex;flex-wrap:wrap;gap:.4em}
.rz-tag{display:inline-block;padding:.16em .65em;border-radius:999px;font-size:.9em;font-weight:500;background:color-mix(in srgb,var(--rz-primary) 10%,#fff);color:color-mix(in srgb,var(--rz-primary) 85%,#000)}
.rz-sk-inline{line-height:1.75}
.rz-sk-inline span+span::before{content:'\\2022';margin:0 .55em;color:var(--rz-accent)}
.rz-sk-columns{columns:3;column-gap:1.4em}
.rz-sk-columns li,.rz-sk-list li{position:relative;padding-left:.95em;break-inside:avoid}
.rz-sk-columns li::before,.rz-sk-list li::before{content:'';position:absolute;left:0;top:.62em;width:.34em;height:.34em;border-radius:50%;background:var(--rz-accent)}
.rz-sk-list{display:flex;flex-direction:column;gap:.15em}
.rz-sk-bars,.rz-sk-dots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55em 1.4em}
.rz-bar-name{display:flex;justify-content:space-between;gap:.5em}
.rz-bar{height:.4em;margin-top:.25em;border-radius:999px;background:color-mix(in srgb,var(--rz-primary) 14%,transparent);overflow:hidden}
.rz-bar i{display:block;height:100%;border-radius:inherit;background:var(--rz-accent)}
.rz-dotrow{display:flex;align-items:center;justify-content:space-between;gap:.6em}
.rz-dots{display:inline-flex;gap:.25em;flex-shrink:0}
.rz-dots i{width:.6em;height:.6em;border-radius:50%;background:color-mix(in srgb,var(--rz-primary) 16%,transparent)}
.rz-dots i.on{background:var(--rz-accent)}

.rz-two{display:grid;grid-template-columns:var(--rz-side-w) minmax(0,1fr);grid-template-rows:auto 1fr;padding:0}
.rz-two.rz-layout-sidebar-right{grid-template-columns:minmax(0,1fr) var(--rz-side-w)}
.rz-aside{grid-row:1 / -1;background:var(--rz-side-bg);color:var(--rz-side-text);padding:var(--rz-m) calc(var(--rz-m) * .72);min-width:0}
.rz-main{grid-row:1 / -1;padding:var(--rz-m) var(--rz-m) var(--rz-m) calc(var(--rz-m) * .85);min-width:0}
.rz-layout-sidebar-right .rz-main{grid-column:1;padding:var(--rz-m) calc(var(--rz-m) * .85) var(--rz-m) var(--rz-m)}
.rz-layout-sidebar-right .rz-aside{grid-column:2}
.rz-layout-banner .rz-aside,.rz-layout-banner .rz-main{grid-row:2}
.rz-aside>*+*{margin-top:var(--rz-gap)}
.rz-aside .rz-h{color:var(--rz-side-head)}
.rz-hs-line .rz-aside .rz-h{border-bottom-color:color-mix(in srgb,var(--rz-side-head) 35%,transparent)}
.rz-hs-double .rz-aside .rz-h{border-bottom-color:color-mix(in srgb,var(--rz-side-head) 50%,transparent)}
.rz-hs-boxed .rz-aside .rz-h{background:var(--rz-side-head);color:var(--rz-side-bg)}
.rz-hs-bar .rz-aside .rz-h{border-left-color:var(--rz-side-accent)}
.rz-hs-underline .rz-aside .rz-h::after,.rz-hs-dot .rz-aside .rz-h::before{background:var(--rz-side-accent)}
.rz-aside .rz-tag{background:color-mix(in srgb,var(--rz-side-text) 14%,transparent);color:inherit}
.rz-aside .rz-bar{background:color-mix(in srgb,var(--rz-side-text) 22%,transparent)}
.rz-aside .rz-bar i,.rz-aside .rz-dots i.on{background:var(--rz-side-accent)}
.rz-aside .rz-dots i{background:color-mix(in srgb,var(--rz-side-text) 22%,transparent)}
.rz-aside .rz-sk-bars,.rz-aside .rz-sk-dots{grid-template-columns:minmax(0,1fr)}
.rz-aside .rz-sk-columns{columns:1}
.rz-aside .rz-sk-columns li::before,.rz-aside .rz-sk-list li::before,.rz-aside .rz-sk-inline span+span::before{background:var(--rz-side-accent);color:var(--rz-side-accent)}
.rz-aside .rz-contact{flex-direction:column;gap:.55em;margin-top:0;color:inherit;font-size:.9em}
.rz-aside .rz-ci{align-items:flex-start;overflow-wrap:anywhere}
.rz-aside .rz-ci svg{stroke:var(--rz-side-accent);margin-top:.15em}
.rz-noicons .rz-aside .rz-contact .rz-ci+.rz-ci::before{content:none}
.rz-aside .rz-emeta,.rz-aside .rz-lang span,.rz-aside .rz-item-sub,.rz-aside .rz-loc{color:inherit;opacity:.78}
.rz-aside .rz-photo{width:34mm;height:34mm;margin:0 auto}
.rz-aside .rz-langs{flex-direction:column;gap:.3em}
.rz-aside .rz-lang{display:flex;justify-content:space-between;gap:.5em}
.rz-aside .rz-item{flex-direction:column;gap:0}
.rz-aside .rz-etitle,.rz-aside .rz-esub{color:inherit}

.rz-layout-classic .rz-name{color:var(--rz-text);letter-spacing:.05em;text-transform:uppercase;font-size:2.05em}
.rz-layout-classic .rz-title{color:var(--rz-primary);font-weight:600;opacity:1}
.rz-layout-classic .rz-header{padding-bottom:.9em;border-bottom:2px solid var(--rz-primary)}
.rz-layout-modern .rz-title{color:var(--rz-accent);font-weight:600;opacity:1}
.rz-layout-minimal .rz-name{font-weight:300;font-size:2.6em;color:var(--rz-text);letter-spacing:-.02em}
.rz-layout-minimal .rz-title{text-transform:uppercase;letter-spacing:.22em;font-size:.82em;color:var(--rz-muted);opacity:1}
.rz-layout-minimal .rz-h{color:var(--rz-text);letter-spacing:.2em;font-size:.84em}
.rz-layout-minimal .rz-esub{color:var(--rz-muted)}
.rz-band{margin:calc(var(--rz-m) * -1) calc(var(--rz-m) * -1) var(--rz-gap);padding:calc(var(--rz-m) * .9) var(--rz-m);background:var(--rz-primary);color:#fff}
.rz-band .rz-header{margin-bottom:0}
.rz-band .rz-name{color:#fff}
.rz-band .rz-title{color:#fff;opacity:.9}
.rz-band .rz-contact{color:rgba(255,255,255,.9)}
.rz-band .rz-ci svg{stroke:#fff}
.rz-band .rz-photo{border:3px solid rgba(255,255,255,.85)}
.rz-layout-compact .rz-name{font-size:1.95em}
.rz-layout-compact .rz-entry+.rz-entry{margin-top:.55em}
.rz-layout-compact .rz-bul li{margin-top:.05em}
.rz-layout-elegant .rz-name{font-weight:400;text-transform:uppercase;letter-spacing:.14em;color:var(--rz-text);font-size:2.15em}
.rz-layout-elegant .rz-title{font-style:italic;color:var(--rz-primary);opacity:1}
.rz-layout-elegant .rz-header{padding-bottom:1em;border-bottom:1px solid color-mix(in srgb,var(--rz-primary) 40%,transparent)}
.rz-layout-elegant .rz-h{text-align:center}
.rz-layout-elegant.rz-hs-underline .rz-h::after{margin-left:auto;margin-right:auto}
.rz-layout-elegant.rz-hs-dot .rz-h{justify-content:center}
.rz-layout-elegant.rz-hs-boxed .rz-h{margin-left:auto;margin-right:auto}
.rz-split{display:flex;align-items:center;gap:1.3em;padding-bottom:1em;margin-bottom:var(--rz-gap);border-bottom:3px solid var(--rz-primary)}
.rz-split .rz-contact{flex-direction:column;align-items:flex-end;gap:.28em;margin:0 0 0 auto;text-align:right;flex-shrink:0;max-width:48%}
.rz-split .rz-ci{flex-direction:row-reverse}
.rz-noicons .rz-split .rz-contact .rz-ci+.rz-ci::before{content:none}
.rz-layout-corporate{border-top:7px solid var(--rz-primary)}
.rz-layout-corporate .rz-split{border-bottom-width:1px;border-bottom-color:color-mix(in srgb,var(--rz-primary) 35%,transparent)}
.rz-layout-corporate .rz-title{text-transform:uppercase;letter-spacing:.12em;font-size:.88em;font-weight:700;color:var(--rz-accent);opacity:1}
.rz-layout-timeline .rz-sec-experience .rz-entry,.rz-layout-timeline .rz-sec-education .rz-entry{position:relative;margin-left:.35em;padding:0 0 .85em 1.35em;border-left:2px solid color-mix(in srgb,var(--rz-primary) 22%,transparent)}
.rz-layout-timeline .rz-sec-experience .rz-entry+.rz-entry,.rz-layout-timeline .rz-sec-education .rz-entry+.rz-entry{margin-top:0}
.rz-layout-timeline .rz-sec-experience .rz-entry:last-child,.rz-layout-timeline .rz-sec-education .rz-entry:last-child{padding-bottom:.1em}
.rz-layout-timeline .rz-sec-experience .rz-entry::before,.rz-layout-timeline .rz-sec-education .rz-entry::before{content:'';position:absolute;left:-.45em;top:.3em;width:.78em;height:.78em;border-radius:50%;background:var(--rz-bg);border:2.5px solid var(--rz-accent)}
.rz-layout-timeline .rz-title{color:var(--rz-accent);font-weight:600;opacity:1}
.rz-layout-tech .rz-title{font-family:'JetBrains Mono',monospace;color:var(--rz-accent);font-size:.98em;opacity:1}
.rz-layout-tech .rz-tag{font-family:'JetBrains Mono',monospace;font-size:.8em;border-radius:4px}
.rz-layout-tech .rz-emeta{font-family:'JetBrains Mono',monospace;font-size:.78em}
.rz-layout-academic .rz-name{color:var(--rz-text);font-weight:600}
.rz-layout-academic .rz-title{font-style:italic}
.rz-layout-academic .rz-h{font-variant:small-caps;letter-spacing:.04em;font-size:1.18em}
.rz-layout-bold{border-top:10px solid var(--rz-primary)}
.rz-layout-bold .rz-name{font-size:2.9em;font-weight:800;text-transform:uppercase;letter-spacing:-.01em;line-height:.98}
.rz-layout-bold .rz-title{font-weight:700;color:var(--rz-accent);text-transform:uppercase;letter-spacing:.1em;font-size:.95em;opacity:1}
.rz-banner{grid-column:1 / -1;grid-row:1;display:flex;align-items:center;gap:1.3em;padding:calc(var(--rz-m) * .85) var(--rz-m);background:var(--rz-primary);color:#fff}
.rz-banner .rz-name{color:#fff}
.rz-banner .rz-title{color:#fff;opacity:.9}
.rz-banner .rz-contact{color:rgba(255,255,255,.9)}
.rz-banner .rz-ci svg{stroke:#fff}
.rz-banner .rz-photo{border:3px solid rgba(255,255,255,.85)}
.rz-ident{text-align:center}
.rz-ident .rz-name{font-size:1.85em;color:var(--rz-side-head);margin-top:.45em}
.rz-ident .rz-title{color:inherit;opacity:.85;margin-top:.3em}
.rz-main>.rz-header{margin-bottom:var(--rz-gap)}
.rz-mode-thumb{pointer-events:none;user-select:none}
`;
