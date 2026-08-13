const vscode = require("vscode");

function activate(context) {
  context.subscriptions.push(vscode.window.registerCustomEditorProvider("debugHarnessFixture.editor", {
    resolveCustomTextEditor(document, panel) {
      panel.webview.options = { enableScripts: true };
      panel.webview.html = `<!doctype html>
<html><head><style>
html, body { margin: 0; font-family: sans-serif; }
#coordinate { position: absolute; inset: 0 auto auto 0; width: 60px; height: 60px; background: #357; color: white; }
main { padding: 80px 20px 20px; }
#drag { width: 90px; height: 50px; background: #c75; touch-action: none; user-select: none; }
#drop { position: absolute; left: 320px; top: 180px; width: 150px; height: 100px; border: 3px dashed #777; }
button, input { margin: 4px; }
</style></head><body>
<button id="coordinate" aria-label="Coordinate area">Coordinate</button>
<main>
  <button aria-label="Click">Click</button>
  <button aria-label="Double click">Double click</button>
  <label>Name <input aria-label="Name"></label>
  <button aria-label="Write source">Write source</button>
  <div id="drag" role="button" aria-label="Draggable box">Drag me</div>
  <div id="drop" role="region" aria-label="Drop area">Drop area</div>
  <div role="status" aria-label="Status"></div>
</main>
<script>
const vscode = acquireVsCodeApi();
const status = document.querySelector('[role=status]');
const set = value => { status.textContent = value; document.body.setAttribute('data-' + value.replace(/ /g, '-'), 'true'); };
document.querySelector('[aria-label="Click"]').addEventListener('click', () => set('clicked'));
document.querySelector('[aria-label="Double click"]').addEventListener('dblclick', () => set('double clicked'));
document.querySelector('[aria-label="Name"]').addEventListener('keydown', event => { if (event.key === 'Enter') set('name ' + event.target.value); });
document.querySelector('[aria-label="Coordinate area"]').addEventListener('click', () => set('coordinate clicked'));
document.querySelector('[aria-label="Write source"]').addEventListener('click', () => vscode.postMessage({ type: 'writeSource' }));
let dragging = false;
const drag = document.querySelector('#drag');
drag.addEventListener('pointerdown', event => { dragging = true; drag.setPointerCapture(event.pointerId); });
drag.addEventListener('pointermove', event => {
  if (!dragging) return;
  const box = document.querySelector('#drop').getBoundingClientRect();
  if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) drag.dataset.overDrop = 'true';
});
drag.addEventListener('pointerup', () => { if (drag.dataset.overDrop === 'true') set('drag complete'); dragging = false; });
window.addEventListener('message', event => { if (event.data.type === 'sourceWritten') set('source written'); });
</script></body></html>`;
      panel.webview.onDidReceiveMessage(async message => {
        if (message.type !== "writeSource") return;
        const edit = new vscode.WorkspaceEdit();
        const lastLine = document.lineAt(document.lineCount - 1);
        edit.insert(document.uri, lastLine.range.end, "\nchanged by harness\n");
        await vscode.workspace.applyEdit(edit);
        await panel.webview.postMessage({ type: "sourceWritten" });
      });
    }
  }));
}

module.exports = { activate };
