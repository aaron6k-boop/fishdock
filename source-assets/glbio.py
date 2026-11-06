import json, struct
def read(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    off = 12; chunks = []
    while off < len(b):
        ln, typ = struct.unpack('<II', b[off:off+8]); chunks.append((typ, b[off+8:off+8+ln])); off += 8 + ln
    j = json.loads(chunks[0][1]); binc = chunks[1][1] if len(chunks) > 1 else b''
    return j, binc
def view(j, binc, i):
    bv = j['bufferViews'][i]; o = bv.get('byteOffset', 0); return binc[o:o+bv['byteLength']]
def write(path, j, binc, replace):
    # replace: {bufferViewIndex: bytes}; rebuild the buffer with every view 4-aligned
    out = bytearray(); views = j['bufferViews']
    for i, bv in enumerate(views):
        data = replace.get(i, view(j, binc, i))
        while len(out) % 4: out.append(0)
        bv['byteOffset'] = len(out); bv['byteLength'] = len(data); out += data
    while len(out) % 4: out.append(0)
    j['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
def image_roles(j):
    roles = {}
    for m in j['materials']:
        pb = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pb: roles[j['textures'][pb['baseColorTexture']['index']]['source']] = (m['name'], 'color')
        if 'normalTexture' in m: roles[j['textures'][m['normalTexture']['index']]['source']] = (m['name'], 'normal')
    return roles
