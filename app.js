"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const $ = (id) => document.getElementById(id);
const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;

const state = {
  file: null,
  bytes: null,
  pdfjs: null,
  page: 1,
  scale: 1,
  rendering: false,
  pendingPage: null,
  penEnabled: false,
  drawing: false,
  currentStroke: null,
  strokes: {},
  originalPdfjs: null, resultBytes: null, resultFilename: null, resultData: null, resultType: "application/pdf", splitParts: null, viewingResult: false,
};

const els = {
  file: $("pdfFile"), drop: $("dropZone"), fileInfo: $("fileInfo"), panel: $("toolPanel"),
  status: $("statusBox"), stage: $("pdfStage"), shell: $("viewerShell"), empty: $("emptyPreview"),
  pdfCanvas: $("pdfCanvas"), penCanvas: $("penCanvas"), pageNum: $("pageNum"),
  pageCount: $("pageCount"), zoomText: $("zoomText")
};
const pdfCtx = els.pdfCanvas.getContext("2d");
const penCtx = els.penCanvas.getContext("2d");

function setStatus(message, type = "light") {
  els.status.className = `status-box alert alert-${type} border mb-0 py-2`;
  els.status.textContent = message;
}
function safeName(name) { return (name || "document").replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9ก-๙_-]+/g, "_"); }
function downloadBlob(data, filename, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function clearResult(){state.resultBytes=null;state.resultFilename=null;state.resultData=null;state.resultType="application/pdf";state.splitParts=null;$("showResult").disabled=true;$("downloadResult").disabled=true;}
async function setResult(bytes,filename){state.resultBytes=new Uint8Array(bytes);state.resultData=state.resultBytes;state.resultType="application/pdf";state.resultFilename=filename;state.splitParts=null;$("showResult").disabled=false;$("downloadResult").disabled=false;await showResult();setStatus("สร้าง Preview แล้ว กรุณาตรวจสอบก่อน Download","success");}
async function showResult(){if(!state.resultBytes)return;state.pdfjs=await pdfjsLib.getDocument({data:state.resultBytes.slice()}).promise;state.page=1;els.pageCount.textContent=state.pdfjs.numPages;await renderPage(1);}
async function showOriginal(){if(!state.originalPdfjs)return;state.pdfjs=state.originalPdfjs;state.page=1;els.pageCount.textContent=state.pdfjs.numPages;await renderPage(1);}
function downloadResult(){if(!state.resultData)return setStatus("กรุณาสร้าง Preview ก่อน","warning");downloadBlob(state.resultData,state.resultFilename,state.resultType);}

function requireFile() {
  if (!state.file || !state.bytes) { setStatus("กรุณาเลือกไฟล์ PDF หลักก่อน", "warning"); return false; }
  return true;
}
async function runTask(button, label, task) {
  const original = button?.innerHTML;
  try {
    if (button) { button.disabled = true; button.innerHTML = `<span class="spinner-border spinner-border-sm"></span> กำลังประมวลผล`; }
    setStatus(`กำลัง${label}...`, "info");
    await task(); setStatus(`${label}สำเร็จ`, "success");
  } catch (error) {
    console.error(error); setStatus(error.message || "เกิดข้อผิดพลาด", "danger");
  } finally { if (button) { button.disabled = false; button.innerHTML = original; } }
}

async function loadMainFile(file) {
  if (!file || !/\.pdf$/i.test(file.name)) { setStatus("รองรับเฉพาะไฟล์ PDF", "warning"); return; }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    state.file = file; state.bytes = bytes; state.pdfjs = pdfjs; state.originalPdfjs = pdfjs; state.page = 1; state.scale = 1; clearResult(); $("showOriginal").disabled=false;
    state.strokes = {}; state.penEnabled = false; els.stage.classList.remove("pen-active");
    els.fileInfo.textContent = `${file.name} • ${formatBytes(file.size)} • ${pdfjs.numPages} หน้า`;
    els.pageCount.textContent = pdfjs.numPages; els.empty.hidden = true; els.stage.hidden = false;
    setStatus("เปิดไฟล์เรียบร้อย", "success"); await renderPage(1);
  } catch (error) { console.error(error); setStatus("เปิด PDF ไม่สำเร็จ ไฟล์อาจเสียหายหรือมีรหัสผ่าน", "danger"); }
}
function formatBytes(n) { if (!n) return "0 B"; const u=["B","KB","MB","GB"], i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3); return `${(n/1024**i).toFixed(i?1:0)} ${u[i]}`; }

async function renderPage(number) {
  if (!state.pdfjs) return;
  if (state.rendering) { state.pendingPage = number; return; }
  state.rendering = true;
  try {
    const page = await state.pdfjs.getPage(number);
    const viewport = page.getViewport({ scale: state.scale });
    els.pdfCanvas.width = Math.ceil(viewport.width); els.pdfCanvas.height = Math.ceil(viewport.height);
    els.penCanvas.width = els.pdfCanvas.width; els.penCanvas.height = els.pdfCanvas.height;
    await page.render({ canvasContext: pdfCtx, viewport }).promise;
    state.page = number; els.pageNum.textContent = number; els.zoomText.textContent = `${Math.round(state.scale*100)}%`;
    renderStrokes();
  } finally {
    state.rendering = false;
    if (state.pendingPage) { const p=state.pendingPage; state.pendingPage=null; renderPage(p); }
  }
}
function goPage(delta) { if (!state.pdfjs) return; const p=Math.max(1,Math.min(state.pdfjs.numPages,state.page+delta)); if (p!==state.page) renderPage(p); }

els.drop.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", (e) => loadMainFile(e.target.files[0]));
["dragenter","dragover"].forEach(x=>els.drop.addEventListener(x,e=>{e.preventDefault();els.drop.classList.add("dragover");}));
["dragleave","drop"].forEach(x=>els.drop.addEventListener(x,e=>{e.preventDefault();els.drop.classList.remove("dragover");}));
els.drop.addEventListener("drop", e=>loadMainFile([...e.dataTransfer.files].find(f=>/\.pdf$/i.test(f.name))));
$("prevPage").onclick=()=>goPage(-1); $("nextPage").onclick=()=>goPage(1);
$("zoomIn").onclick=()=>{if(state.pdfjs){state.scale=Math.min(3,state.scale+.2);renderPage(state.page);}};
$("zoomOut").onclick=()=>{if(state.pdfjs){state.scale=Math.max(.4,state.scale-.2);renderPage(state.page);}};
$("fitWidth").onclick=async()=>{if(!state.pdfjs)return;const p=await state.pdfjs.getPage(state.page);const v=p.getViewport({scale:1});state.scale=Math.max(.4,(els.shell.clientWidth-50)/v.width);renderPage(state.page);};
$("resetBtn").onclick=()=>location.reload();
$("showOriginal").onclick=showOriginal; $("showResult").onclick=showResult; $("downloadResult").onclick=downloadResult;

document.querySelectorAll("[data-tool]").forEach(btn=>btn.addEventListener("click",()=>selectTool(btn.dataset.tool,btn)));
function selectTool(tool, button) {
  document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b===button));
  state.penEnabled = tool === "pen"; els.stage.classList.toggle("pen-active",state.penEnabled);
  const blocks = {
    merge: `<h2 class="h6">📚 รวม PDF</h2><p class="small-note">เลือกอย่างน้อย 2 ไฟล์ ระบบจะรวมตามลำดับที่เลือก</p><input id="mergeFiles" class="form-control mb-3" type="file" accept=".pdf,application/pdf" multiple><button id="mergeRun" class="btn btn-primary w-100">Preview ผลลัพธ์</button>`,
    split: `<h2 class="h6">✂️ แบ่ง PDF เป็น 2 ส่วน</h2><label class="form-label">แบ่งหลังหน้าที่</label><input id="splitAt" class="form-control mb-2" type="number" min="1" value="1"><div class="small-note mb-3">ตัวอย่าง: 3 จะได้หน้า 1-3 และ 4-หน้าสุดท้าย</div><button id="splitRun" class="btn btn-primary w-100">สร้าง Preview Split</button><div id="splitPreviewChoice" class="btn-group w-100 mt-2" hidden><button id="previewPart1" class="btn btn-outline-success btn-sm">Preview Part 1</button><button id="previewPart2" class="btn btn-outline-success btn-sm">Preview Part 2</button></div>`,
    extract: `<h2 class="h6">📤 แยกหน้าที่ต้องการ</h2><label class="form-label">หมายเลขหน้า</label><input id="extractPages" class="form-control mb-2" value="1,3,5-7"><div class="small-note mb-3">รองรับ 1,3,5-7 และลบหมายเลขซ้ำอัตโนมัติ</div><button id="extractRun" class="btn btn-primary w-100">Preview ผลลัพธ์</button>`,
    pageNumber: `<h2 class="h6">🔢 เพิ่มเลขหน้า</h2><label class="form-label">รูปแบบ</label><select id="numberFormat" class="form-select mb-3"><option value="page-total">Page 1 / 10</option><option value="number">1</option><option value="thai-total">หน้า 1 / 10</option></select><label class="form-label">ตำแหน่ง</label><select id="numberPosition" class="form-select mb-3"><option value="bc">ล่างกลาง</option><option value="br">ล่างขวา</option><option value="bl">ล่างซ้าย</option><option value="tc">บนกลาง</option><option value="tr">บนขวา</option><option value="tl">บนซ้าย</option></select><label class="form-label">เริ่มเลขที่</label><input id="numberStart" class="form-control mb-3" type="number" value="1"><button id="numberRun" class="btn btn-primary w-100">Preview ผลลัพธ์</button>`,
    rotate: `<h2 class="h6">🔄 หมุนทุกหน้า</h2><select id="rotateAngle" class="form-select mb-3"><option value="90">90° ตามเข็ม</option><option value="180">180°</option><option value="270">90° ทวนเข็ม</option></select><button id="rotateRun" class="btn btn-primary w-100">Preview ผลลัพธ์</button>`,
    watermark: `<h2 class="h6">💧 เพิ่มลายน้ำ</h2><label class="form-label">ข้อความ</label><input id="wmText" class="form-control mb-3" value="สุดยอดมากเลยครับ"><div class="row g-2"><div class="col-6"><label class="form-label">สี</label><input id="wmColor" class="form-control form-control-color w-100" type="color" value="#dc2626"></div><div class="col-6"><label class="form-label">ขนาด</label><input id="wmSize" class="form-control" type="number" min="18" max="160" value="60"></div><div class="col-6"><label class="form-label">โปร่งใส %</label><input id="wmOpacity" class="form-control" type="number" min="5" max="100" value="25"></div><div class="col-6"><label class="form-label">มุม</label><input id="wmAngle" class="form-control" type="number" min="-90" max="90" value="45"></div></div><button id="wmRun" class="btn btn-primary w-100 mt-3">Preview ลายน้ำ</button>`,
    pen: `<h2 class="h6">✍️ เขียนด้วยปากกา</h2><div class="row g-2"><div class="col-5"><label class="form-label">สี</label><input id="penColor" class="form-control form-control-color w-100" type="color" value="#e11d48"></div><div class="col-7"><label class="form-label">ความหนา <span id="penSizeOut">4</span> px</label><input id="penSize" class="form-range" type="range" min="1" max="30" value="4"></div></div><div class="d-grid gap-2 mt-3"><button id="penUndo" class="btn btn-outline-secondary">↶ ย้อนกลับเส้นล่าสุด</button><button id="penClear" class="btn btn-outline-danger">ล้างลายเส้นหน้านี้</button><button id="penSave" class="btn btn-primary">Preview ลายเส้น</button></div><p class="small-note mt-3 mb-0">รองรับ Mouse, Touch และ Stylus ลายเส้นจะแยกตามแต่ละหน้า</p>`
  };
  els.panel.innerHTML = blocks[tool]; bindTool(tool);
}
function bindTool(tool) {
  if(tool==="merge") $("mergeRun").onclick=e=>runTask(e.currentTarget,"รวม PDF",mergePDF);
  if(tool==="split") { $("splitRun").onclick=e=>runTask(e.currentTarget,"แบ่ง PDF",splitPDF); $("previewPart1")?.addEventListener("click",()=>showSplitPart(0)); $("previewPart2")?.addEventListener("click",()=>showSplitPart(1)); }
  if(tool==="extract") $("extractRun").onclick=e=>runTask(e.currentTarget,"แยกหน้า",extractPDF);
  if(tool==="pageNumber") $("numberRun").onclick=e=>runTask(e.currentTarget,"เพิ่มเลขหน้า",addPageNumbers);
  if(tool==="rotate") $("rotateRun").onclick=e=>runTask(e.currentTarget,"หมุน PDF",rotatePDF);
  if(tool==="watermark") $("wmRun").onclick=e=>runTask(e.currentTarget,"เพิ่มลายน้ำ",addWatermark);
  if(tool==="pen") { $("penSize").oninput=e=>$("penSizeOut").textContent=e.target.value; $("penUndo").onclick=undoPen; $("penClear").onclick=clearPen; $("penSave").onclick=e=>runTask(e.currentTarget,"บันทึกลายเส้น",savePenPDF); renderStrokes(); }
}

async function mergePDF() {
  const files=[...$("mergeFiles").files]; if(files.length<2) throw new Error("กรุณาเลือกอย่างน้อย 2 ไฟล์");
  const out=await PDFDocument.create();
  for(const f of files){const src=await PDFDocument.load(await f.arrayBuffer());const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p));}
  await setResult(await out.save(),"merged.pdf");
}
async function showSplitPart(index){
  if(!state.splitParts || !state.splitParts[index]) return;
  state.resultBytes=state.splitParts[index];
  state.pdfjs=await pdfjsLib.getDocument({data:state.resultBytes.slice()}).promise;
  state.page=1; els.pageCount.textContent=state.pdfjs.numPages; await renderPage(1);
  setStatus(`กำลังแสดง Preview Part ${index+1} จาก ${state.splitParts.length} ส่วน`,"info");
}
async function splitPDF() {
  if(!requireFile()) throw new Error("กรุณาเลือก PDF หลัก");
  const src=await PDFDocument.load(state.bytes.slice()); const total=src.getPageCount(); const at=Number($("splitAt").value);
  if(!Number.isInteger(at)||at<1||at>=total) throw new Error(`ระบุหน้าระหว่าง 1 ถึง ${Math.max(1,total-1)}`);
  const a=await PDFDocument.create(), b=await PDFDocument.create();
  (await a.copyPages(src,Array.from({length:at},(_,i)=>i))).forEach(p=>a.addPage(p));
  (await b.copyPages(src,Array.from({length:total-at},(_,i)=>i+at))).forEach(p=>b.addPage(p));
  const part1=new Uint8Array(await a.save()), part2=new Uint8Array(await b.save());
  const zip=new JSZip(), base=safeName(state.file.name);
  zip.file(`${base}_part1.pdf`,part1); zip.file(`${base}_part2.pdf`,part2);
  state.splitParts=[part1,part2]; state.resultBytes=part1;
  state.resultData=await zip.generateAsync({type:"blob"}); state.resultType="application/zip"; state.resultFilename=`${base}_split.zip`;
  $("showResult").disabled=false; $("downloadResult").disabled=false;
  await showSplitPart(0);
  const host=$("splitPreviewChoice"); if(host) host.hidden=false;
  setStatus("สร้าง Split สำเร็จ กำลัง Preview Part 1 และ Download จะได้ ZIP ทั้ง 2 ไฟล์","success");
}
function parsePages(text,total){
  const result=[]; for(const raw of text.split(",")){const s=raw.trim();if(!s)continue;if(/^\d+$/.test(s))result.push(Number(s));else{const m=s.match(/^(\d+)\s*-\s*(\d+)$/);if(!m)throw new Error(`รูปแบบหน้าไม่ถูกต้อง: ${s}`);let a=+m[1],b=+m[2];if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)result.push(n);}}
  const unique=[...new Set(result)]; if(!unique.length||unique.some(n=>n<1||n>total))throw new Error(`หมายเลขหน้าต้องอยู่ระหว่าง 1 ถึง ${total}`);return unique.map(n=>n-1);
}
async function extractPDF(){
  if(!requireFile())throw new Error("กรุณาเลือก PDF หลัก"); const src=await PDFDocument.load(state.bytes.slice());const idx=parsePages($("extractPages").value,src.getPageCount());const out=await PDFDocument.create();
  (await out.copyPages(src,idx)).forEach(p=>out.addPage(p));await setResult(await out.save(),`${safeName(state.file.name)}_extract.pdf`);
}
async function addPageNumbers(){
  if(!requireFile())throw new Error("กรุณาเลือก PDF หลัก"); const doc=await PDFDocument.load(state.bytes.slice());const font=await doc.embedFont(StandardFonts.Helvetica);const pages=doc.getPages(),start=Number($("numberStart").value)||1,fmt=$("numberFormat").value,pos=$("numberPosition").value;
  pages.forEach((p,i)=>{const n=start+i;let text=fmt==="number"?`${n}`:fmt==="thai-total"?`Page ${n} / ${start+pages.length-1}`:`Page ${n} / ${start+pages.length-1}`;const size=10,tw=font.widthOfTextAtSize(text,size),m=18;let x=pos.endsWith("l")?m:pos.endsWith("r")?p.getWidth()-tw-m:(p.getWidth()-tw)/2;let y=pos.startsWith("t")?p.getHeight()-size-m:m;p.drawText(text,{x,y,size,font,color:rgb(.25,.25,.25)});});
  await setResult(await doc.save(),`${safeName(state.file.name)}_numbered.pdf`);
}
async function rotatePDF(){
  if(!requireFile())throw new Error("กรุณาเลือก PDF หลัก");const doc=await PDFDocument.load(state.bytes.slice()),add=Number($("rotateAngle").value);doc.getPages().forEach(p=>p.setRotation(degrees((p.getRotation().angle+add)%360)));await setResult(await doc.save(),`${safeName(state.file.name)}_rotated.pdf`);
}
function hexRgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function makeWatermarkPng(text,color,size,opacity){
  const c=document.createElement("canvas"),ctx=c.getContext("2d");ctx.font=`700 ${size}px Tahoma, Arial, sans-serif`;const width=Math.ceil(ctx.measureText(text).width+50);c.width=width;c.height=Math.ceil(size*1.65);ctx.font=`700 ${size}px Tahoma, Arial, sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";const [r,g,b]=hexRgb(color);ctx.fillStyle=`rgba(${r},${g},${b},${opacity})`;ctx.fillText(text,c.width/2,c.height/2);return c.toDataURL("image/png");
}
async function addWatermark(){
  if(!requireFile())throw new Error("กรุณาเลือก PDF หลัก");const text=$("wmText").value.trim();if(!text)throw new Error("กรุณาระบุข้อความลายน้ำ");const doc=await PDFDocument.load(state.bytes.slice()),png=await doc.embedPng(makeWatermarkPng(text,$("wmColor").value,Number($("wmSize").value),Number($("wmOpacity").value)/100)),angle=Number($("wmAngle").value);
  doc.getPages().forEach(p=>{const maxW=p.getWidth()*.72,ratio=png.height/png.width,w=Math.min(maxW,png.width),h=w*ratio;p.drawImage(png,{x:(p.getWidth()-w)/2,y:(p.getHeight()-h)/2,width:w,height:h,rotate:degrees(angle)});});await setResult(await doc.save(),`${safeName(state.file.name)}_watermark.pdf`);
}

function pointerPos(e){const r=els.penCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*els.penCanvas.width/r.width,y:(e.clientY-r.top)*els.penCanvas.height/r.height};}
els.penCanvas.addEventListener("pointerdown",e=>{if(!state.penEnabled||!state.pdfjs)return;e.preventDefault();els.penCanvas.setPointerCapture(e.pointerId);state.drawing=true;const p=pointerPos(e);state.currentStroke={color:$("penColor")?.value||"#e11d48",width:Number($("penSize")?.value||4),points:[p]};});
els.penCanvas.addEventListener("pointermove",e=>{if(!state.drawing||!state.currentStroke)return;e.preventDefault();const p=pointerPos(e),pts=state.currentStroke.points,prev=pts[pts.length-1];pts.push(p);penCtx.strokeStyle=state.currentStroke.color;penCtx.lineWidth=state.currentStroke.width;penCtx.lineCap="round";penCtx.lineJoin="round";penCtx.beginPath();penCtx.moveTo(prev.x,prev.y);penCtx.lineTo(p.x,p.y);penCtx.stroke();});
function endStroke(e){if(!state.drawing||!state.currentStroke)return;state.drawing=false;(state.strokes[state.page]??=[]).push(state.currentStroke);state.currentStroke=null;try{els.penCanvas.releasePointerCapture(e.pointerId)}catch{}}
els.penCanvas.addEventListener("pointerup",endStroke);els.penCanvas.addEventListener("pointercancel",endStroke);
function renderStrokes(){penCtx.clearRect(0,0,els.penCanvas.width,els.penCanvas.height);for(const s of state.strokes[state.page]||[]){if(!s.points.length)continue;penCtx.strokeStyle=s.color;penCtx.lineWidth=s.width;penCtx.lineCap="round";penCtx.lineJoin="round";penCtx.beginPath();penCtx.moveTo(s.points[0].x,s.points[0].y);s.points.slice(1).forEach(p=>penCtx.lineTo(p.x,p.y));penCtx.stroke();}}
function undoPen(){(state.strokes[state.page]||[]).pop();renderStrokes();setStatus("ย้อนกลับเส้นล่าสุดแล้ว","light");}
function clearPen(){state.strokes[state.page]=[];renderStrokes();setStatus("ล้างลายเส้นหน้าปัจจุบันแล้ว","light");}
function strokeOverlay(strokes,w,h){const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");for(const s of strokes){if(!s.points.length)continue;x.strokeStyle=s.color;x.lineWidth=s.width;x.lineCap="round";x.lineJoin="round";x.beginPath();x.moveTo(s.points[0].x,s.points[0].y);s.points.slice(1).forEach(p=>x.lineTo(p.x,p.y));x.stroke();}return c.toDataURL("image/png");}
async function savePenPDF(){
  if(!requireFile())throw new Error("กรุณาเลือก PDF หลัก");const keys=Object.keys(state.strokes).filter(k=>state.strokes[k].length);if(!keys.length)throw new Error("ยังไม่มีลายเส้น");const doc=await PDFDocument.load(state.bytes.slice()),pages=doc.getPages();
  for(const key of keys){const n=Number(key),viewPage=await state.pdfjs.getPage(n),viewport=viewPage.getViewport({scale:state.scale}),data=strokeOverlay(state.strokes[n],Math.ceil(viewport.width),Math.ceil(viewport.height)),img=await doc.embedPng(data),p=pages[n-1];p.drawImage(img,{x:0,y:0,width:p.getWidth(),height:p.getHeight()});}
  await setResult(await doc.save(),`${safeName(state.file.name)}_pen.pdf`);
}

/* ===== Object Editor: Move / Resize / Rotate / Delete - FIX ===== */
state.editor = null;
state.editorPages = {};
state.editorMode = "select";

function saveEditorPage() {
  if (state.editor && state.page) state.editorPages[state.page] = state.editor.toJSON(["editorType"]);
}
function updateObjectDeleteButton() {
  const button = document.getElementById("deleteObject");
  if (button) button.disabled = !state.editor?.getActiveObject();
}
function createObjectEditor() {
  if (typeof fabric === "undefined") return setStatus("โหลด Fabric.js ไม่สำเร็จ กรุณาตรวจสอบ Internet/CDN", "danger");
  saveEditorPage();
  if (state.editor) state.editor.dispose();
  const canvas = document.getElementById("editorCanvas");
  canvas.width = els.pdfCanvas.width;
  canvas.height = els.pdfCanvas.height;
  state.editor = new fabric.Canvas("editorCanvas", {
    width: canvas.width, height: canvas.height,
    selection: true, preserveObjectStacking: true,
    fireRightClick: true, stopContextMenu: true
  });
  state.editor.setDimensions({width:canvas.width,height:canvas.height});
  state.editor.selectionColor = "rgba(37,99,235,.12)";
  state.editor.selectionBorderColor = "#2563eb";
  state.editor.selectionLineWidth = 1;
  state.editor.on("selection:created", updateObjectDeleteButton);
  state.editor.on("selection:updated", updateObjectDeleteButton);
  state.editor.on("selection:cleared", updateObjectDeleteButton);
  state.editor.on("object:moving", e => constrainEditorObject(e.target));
  const saved = state.editorPages[state.page];
  if (saved) state.editor.loadFromJSON(saved, () => {
    state.editor.getObjects().forEach(enableEditorObject);
    state.editor.requestRenderAll();
  });
  updateObjectDeleteButton();
}
function enableEditorObject(obj) {
  obj.set({
    selectable:true,evented:true,hasControls:true,hasBorders:true,
    lockMovementX:false,lockMovementY:false,lockScalingX:false,lockScalingY:false,lockRotation:false,
    cornerColor:"#2563eb",cornerStrokeColor:"#ffffff",borderColor:"#2563eb",
    transparentCorners:false,cornerStyle:"circle",cornerSize:12,padding:4
  });
  obj.setControlsVisibility({mt:true,mb:true,ml:true,mr:true,tl:true,tr:true,bl:true,br:true,mtr:true});
  obj.setCoords(); return obj;
}
function constrainEditorObject(obj) {
  if (!obj || !state.editor) return;
  const box=obj.getBoundingRect(true,true),cw=state.editor.getWidth(),ch=state.editor.getHeight();
  if(box.left<0)obj.left-=box.left;
  if(box.top<0)obj.top-=box.top;
  if(box.left+box.width>cw)obj.left-=box.left+box.width-cw;
  if(box.top+box.height>ch)obj.top-=box.top+box.height-ch;
  obj.setCoords();
}
function addEditorObject(obj) {
  if (!state.editor) return setStatus("กรุณาเปิด PDF ก่อน", "warning");
  obj.set({left:70,top:70}); enableEditorObject(obj);
  state.editor.add(obj); state.editor.setActiveObject(obj); state.editor.requestRenderAll();
  updateObjectDeleteButton(); setStatus("วัตถุพร้อมแก้ไข: ลากกลางวัตถุเพื่อ Move และลากจุดสีน้ำเงินเพื่อ Resize", "success");
}
function deleteSelectedEditorObject() {
  if (!state.editor) return;
  state.editor.getActiveObjects().forEach(obj => state.editor.remove(obj));
  state.editor.discardActiveObject();state.editor.requestRenderAll();updateObjectDeleteButton();
}
document.getElementById("deleteObject")?.addEventListener("click",deleteSelectedEditorObject);
document.addEventListener("keydown",e=>{
  if((e.key==="Delete"||e.key==="Backspace")&&state.editor?.getActiveObject()&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){
    e.preventDefault();deleteSelectedEditorObject();
  }
});

const renderPageBeforeObjectEditor = renderPage;
renderPage = async function(number){
  saveEditorPage();
  await renderPageBeforeObjectEditor(number);
  createObjectEditor();
};
const loadMainFileBeforeObjectEditor = loadMainFile;
loadMainFile = async function(file){state.editorPages={};await loadMainFileBeforeObjectEditor(file);};

const selectToolBeforeObjectEditor = selectTool;
selectTool = function(tool,button){
  const objectTools=["select","addText","highlight","shape","icon","picture","watermark"];
  if(!objectTools.includes(tool)){
    if(state.editor){state.editor.discardActiveObject();state.editor.requestRenderAll();}
    return selectToolBeforeObjectEditor(tool,button);
  }
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b===button));
  state.penEnabled=false;els.stage.classList.remove('pen-active');state.editorMode=tool;
  const ui={
    select:`<h2 class="h6">↖️ Select / Move</h2><p class="small-note">ลากกลางวัตถุเพื่อย้าย ลากจุดมุมเพื่อ Resize จุดด้านบนเพื่อ Rotate</p>`,
    addText:`<h2 class="h6">🔤 Add Text</h2><textarea id="eoText" class="form-control mb-2">ข้อความตัวอย่าง</textarea><div class="row g-2"><div class="col"><input id="eoTextColor" type="color" class="form-control w-100" value="#dc2626"></div><div class="col"><input id="eoTextSize" type="number" class="form-control" value="28"></div></div><button id="eoAddText" class="btn btn-primary w-100 mt-2">เพิ่มข้อความ</button><button id="eoPreview" class="btn btn-success w-100 mt-2">Preview งานแก้ไข</button>`,
    highlight:`<h2 class="h6">🖍️ Highlight</h2><input id="eoHiColor" type="color" class="form-control w-100" value="#fff200"><input id="eoHiOpacity" type="range" min="10" max="80" value="35" class="form-range mt-2"><button id="eoAddHi" class="btn btn-primary w-100">เพิ่ม Highlight</button><button id="eoPreview" class="btn btn-success w-100 mt-2">Preview งานแก้ไข</button>`,
    shape:`<h2 class="h6">⬜ Shape</h2><select id="eoShape" class="form-select mb-2"><option value="rect">สี่เหลี่ยม</option><option value="circle">วงกลม</option><option value="triangle">สามเหลี่ยม</option></select><input id="eoShapeColor" type="color" class="form-control w-100" value="#2563eb"><button id="eoAddShape" class="btn btn-primary w-100 mt-2">เพิ่ม Shape</button><button id="eoPreview" class="btn btn-success w-100 mt-2">Preview งานแก้ไข</button>`,
    icon:`<h2 class="h6">⭐ Icon</h2><select id="eoIcon" class="form-select"><option>✅</option><option>⭐</option><option>⚠️</option><option>❌</option><option>📌</option><option>💡</option></select><button id="eoAddIcon" class="btn btn-primary w-100 mt-2">เพิ่ม Icon</button><button id="eoPreview" class="btn btn-success w-100 mt-2">Preview งานแก้ไข</button>`,
    picture:`<h2 class="h6">🖼️ Picture</h2><input id="eoPicture" type="file" accept="image/*" class="form-control"><p class="small-note mt-2">เลือกรูปแล้วลากย้ายหรือปรับขนาดได้</p><button id="eoPreview" class="btn btn-success w-100 mt-2">Preview งานแก้ไข</button>`,
    watermark:`<h2 class="h6">💧 Watermark แบบเคลื่อนย้ายได้</h2><input id="eoWm" class="form-control mb-2" value="สุดยอดมากเลยครับ"><input id="eoWmColor" type="color" class="form-control w-100" value="#dc2626"><button id="eoAddWm" class="btn btn-primary w-100 mt-2">เพิ่ม Watermark</button><button id="eoPreview" class="btn btn-success w-100 mt-2">Preview งานแก้ไข</button>`
  };
  els.panel.innerHTML=ui[tool];
  $("eoAddText")?.addEventListener("click",()=>addEditorObject(new fabric.Textbox($("eoText").value,{width:280,fill:$("eoTextColor").value,fontSize:+$("eoTextSize").value,fontFamily:"Tahoma"})));
  $("eoAddHi")?.addEventListener("click",()=>addEditorObject(new fabric.Rect({width:260,height:40,fill:$("eoHiColor").value,opacity:+$("eoHiOpacity").value/100})));
  $("eoAddShape")?.addEventListener("click",()=>{const t=$("eoShape").value,c=$("eoShapeColor").value;const o=t==="circle"?new fabric.Circle({radius:55,fill:"transparent",stroke:c,strokeWidth:4}):t==="triangle"?new fabric.Triangle({width:120,height:100,fill:"transparent",stroke:c,strokeWidth:4}):new fabric.Rect({width:160,height:90,fill:"transparent",stroke:c,strokeWidth:4});addEditorObject(o)});
  $("eoAddIcon")?.addEventListener("click",()=>addEditorObject(new fabric.Text($("eoIcon").value,{fontSize:64,fontFamily:"Segoe UI Emoji"})));
  $("eoPicture")?.addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>fabric.Image.fromURL(r.result,img=>{img.scaleToWidth(200);addEditorObject(img)});r.readAsDataURL(f)});
  $("eoAddWm")?.addEventListener("click",()=>addEditorObject(new fabric.Textbox($("eoWm").value,{width:430,fill:$("eoWmColor").value,fontSize:58,fontWeight:"bold",fontFamily:"Tahoma",opacity:.25,angle:-35})));
  $("eoPreview")?.addEventListener("click",e=>runTask(e.currentTarget,"สร้าง Preview",saveObjectEditorPDF));
};

async function saveObjectEditorPDF(){
  if(!requireFile())throw new Error("กรุณาเลือก PDF หลัก");saveEditorPage();
  const keys=Object.keys(state.editorPages).filter(k=>state.editorPages[k]?.objects?.length);if(!keys.length)throw new Error("ยังไม่มีวัตถุบน PDF");
  const doc=await PDFDocument.load(state.bytes.slice()),pages=doc.getPages();
  for(const key of keys){
    const originalPage=await state.originalPdfjs.getPage(+key),viewport=originalPage.getViewport({scale:state.scale});
    const c=document.createElement("canvas");c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);
    const fc=new fabric.StaticCanvas(c,{width:c.width,height:c.height});
    await new Promise(resolve=>fc.loadFromJSON(state.editorPages[key],()=>{fc.renderAll();resolve()}));
    const image=await doc.embedPng(c.toDataURL("image/png")),page=pages[+key-1];
    page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});fc.dispose();
  }
  await setResult(await doc.save(),`${safeName(state.file.name)}_edited.pdf`);
}


function applyTheme(theme){

    if(theme === "dark"){

        document.body.classList
            .add("dark-theme");

        document
            .getElementById("themeBtn")
            .innerHTML =
            "☀️ Light";

    }
    else{

        document.body.classList
            .remove("dark-theme");

        document
            .getElementById("themeBtn")
            .innerHTML =
            "🌙 Dark";

    }

}

function toggleTheme(){

    const isDark =
        document.body.classList
        .contains("dark-theme");

    const theme =
        isDark
        ? "light"
        : "dark";

    localStorage.setItem(
        "pdfTheme",
        theme
    );

    applyTheme(theme);

}

document
.getElementById("themeBtn")
.addEventListener(
    "click",
    toggleTheme
);

const savedTheme =
    localStorage.getItem(
        "pdfTheme"
    ) || "light";

applyTheme(savedTheme);
