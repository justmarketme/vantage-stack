import os, sys, cv2, insightface
from insightface.app import FaceAnalysis

source, target, out = sys.argv[1], sys.argv[2], sys.argv[3]
MODEL = os.path.expanduser("~/.insightface/models/inswapper_128.onnx")

app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=-1, det_size=(640, 640))
swapper = insightface.model_zoo.get_model(MODEL, providers=["CPUExecutionProvider"])

src = cv2.imread(source)
tgt = cv2.imread(target)
src_faces = app.get(src)
tgt_faces = app.get(tgt)
print("src faces:", len(src_faces), "tgt faces:", len(tgt_faces))
if not src_faces or not tgt_faces:
    print("NO FACE FOUND"); sys.exit(1)
# largest source face = her
src_face = sorted(src_faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))[-1]
res = tgt.copy()
for f in tgt_faces:
    res = swapper.get(res, f, src_face, paste_back=True)
cv2.imwrite(out, res)
print("WROTE", out)
