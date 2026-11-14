import json, struct, numpy as np
def load(path, meshsub):
    buf=open(path,'rb').read()
    jl=struct.unpack('<I',buf[12:16])[0]; j=json.loads(buf[20:20+jl]); bin0=20+jl+8
    def acc(i):
        a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; off=bin0+bv.get('byteOffset',0)+a.get('byteOffset',0)
        dt={5126:np.float32,5123:np.uint16,5121:np.uint8,5125:np.uint32}[a['componentType']]; n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        itemsize=np.dtype(dt).itemsize; stride=bv.get('byteStride',itemsize*n)
        if stride==itemsize*n: return np.frombuffer(buf,dtype=dt,count=a['count']*n,offset=off).reshape(a['count'],n).astype(np.float64)
        out=np.zeros((a['count'],n));
        for k in range(a['count']): out[k]=np.frombuffer(buf,dtype=dt,count=n,offset=off+k*stride)
        return out
    mesh=[m for m in j['meshes'] if meshsub in m['name']][0]; p=mesh['primitives'][0]
    d={k:acc(v) for k,v in p['attributes'].items()}; d['idx']=acc(p['indices']).astype(int).reshape(-1,3)
    skin=j['skins'][0]; d['names']=[j['nodes'][n]['name'] for n in skin['joints']]
    d['ibm']=acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)  # column-major -> row-major
    return d
