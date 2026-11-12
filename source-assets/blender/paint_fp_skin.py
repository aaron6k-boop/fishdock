# FishDock: the hands' colour map, painted over the relief the model already has (the relief map baked from Blender
# Studio's sculpt): one even skin tone in place of the blotchy colour carried across from the MakeHuman body, darker
# and redder in the creases, redder over the knuckles and at the fingertips, a paler palm, and nails with their own
# colour and a pale free edge. source: fp_skin_normal_bs_c.png; out: fp_skin_albedo_v4e.png, fp_skin_rough_v4e.png
import numpy as np, cv2
from scipy import ndimage as ndi
SRC='/mnt/user-data/uploads/FishDock-assets/source/people/'
A=cv2.imread(SRC+'fp_skin_albedo_bs_c.png',cv2.IMREAD_UNCHANGED)[...,:3][...,::-1].astype(np.float32)/255
N=cv2.imread(SRC+'fp_skin_normal_bs_c.png',cv2.IMREAD_UNCHANGED)[...,:3][...,::-1].astype(np.float32)/255*2-1
R0=cv2.imread(SRC+'fp_skin_rough_bs_c.png',cv2.IMREAD_UNCHANGED); R0=(R0[...,0] if R0.ndim==3 else R0).astype(np.float32)/255
mask=(A.sum(-1)>0.05); lab=np.load('lab.npy'); BACK,FORE,PALM=2,1,3
g=ndi.gaussian_filter
div=np.gradient(N[...,0],axis=1)-np.gradient(N[...,1],axis=0)
c1,c3,c8,c20=g(div,1.5),g(div,4),g(div,10),g(div,24)
H,W=mask.shape; rng=np.random.default_rng(5)
def noise(r,amp=1.0):
    n=g(rng.standard_normal((H,W)).astype(np.float32),r); return n/ (n.std()+1e-9)*amp
# ---- nails: the groove round each is the sharpest thing on the back of the hand ----
ring=(c1<-0.03)&(lab==BACK); ring=ndi.binary_dilation(ring,iterations=2)
rl,n=ndi.label(ring); nails=np.zeros((H,W),np.uint8); cen=[]
for i,sl in enumerate(ndi.find_objects(rl)):
    h,w=sl[0].stop-sl[0].start,sl[1].stop-sl[1].start
    if not (48<h<150 and 48<w<150): continue
    comp=(rl[sl]==i+1); 
    if comp.sum()<0.12*h*w: continue
    pts=np.argwhere(comp)[:,::-1].astype(np.int32)+np.array([sl[1].start,sl[0].start],np.int32)
    hull=cv2.convexHull(pts); m=np.zeros((H,W),np.uint8); cv2.fillConvexPoly(m,hull,1)
    m=cv2.erode(m,np.ones((3,3),np.uint8),iterations=5)
    if m.sum()<1200: continue
    nails|=m; ys,xs=np.where(m>0); cen.append((xs.mean(),ys.mean(),m.sum()))
nails=nails.astype(bool)&(lab==BACK)
print('nails',len(cen),[(int(x),int(y),int(a)) for x,y,a in cen]); assert len(cen)==5
nsoft=g(nails.astype(np.float32),3.0)
# ---- skin ----
back=np.array([0.79,0.632,0.54],np.float32); palm=np.array([0.83,0.665,0.59],np.float32); fore=back.copy()
col=np.zeros((H,W,3),np.float32)
wp=g((lab==PALM).astype(np.float32),3); wf=g((lab==FORE).astype(np.float32),3)
# (the palm's paler tone fades out towards the wrist, where its island meets the forearm's: no step in colour there)
yy0=np.mgrid[0:H,0:W][0].astype(np.float32); py=np.where(lab==PALM)[0]; wp*=1-np.clip((yy0-(py.max()-330))/260,0,1)
col[:]=back; col=col*(1-wp[...,None])+palm*wp[...,None]; col=col*(1-wf[...,None])+fore*wf[...,None]
def tint(c,rgb,w): w=np.clip(w,0,1)[...,None]; return c*(1-w)+c*np.array(rgb,np.float32)*w
# uneven colour, large and small
# (none of it on the forearm or near the wrist, where three islands of the sheet meet on the arm: any difference
# between them there shows as a line round the wrist)
by=np.where(lab==BACK)[0]; away=np.where(lab==PALM,np.clip(((py.max()-330)-yy0)/300,0,1),np.where(lab==BACK,np.clip(((by.max()-330)-yy0)/300,0,1),0.0)).astype(np.float32)
col*= (1+0.02*noise(70)*away)[...,None]; col=tint(col,(1.04,0.97,0.96),np.clip(0.5+0.5*noise(30),0,1)*0.6*away); col*= (1+0.006*noise(2.5))[...,None]
# knuckles and joints (the back's bumps) redder; the palm's pads pinker
kn=np.clip(c8/0.006,0,1)*(lab==BACK); col=tint(col,(1.03,0.95,0.93),g(kn,6)*0.45)
pad=np.clip(c20/0.003,0,1)*(lab==PALM); col=tint(col,(1.04,0.94,0.93),g(pad,8)*0.5)
# fingertips redder, round each nail
tip=g(nails.astype(np.float32),55); tip=np.clip(tip/ (tip.max()+1e-9)*1.6,0,1)*(lab==BACK); col=tint(col,(1.04,0.92,0.9),tip*0.5)
# creases: darker and browner, the fine ones and the deep ones
cr=np.clip((-c1-0.006)/0.03,0,1)*0.6+np.clip((-c3-0.003)/0.014,0,1)*0.5; cr=np.clip(g(cr,1.2),0,1); col=tint(col,(0.86,0.76,0.72),cr*(0.32*(lab==BACK)+0.45*(lab!=BACK)))
rd=np.clip(c1/0.02,0,1); col=tint(col,(1.03,1.01,1.0),rd*0.2)
# veins on the back of the hand: the long soft ridges, a little cooler
vein=np.clip(c8/0.005,0,1)*np.clip(1-kn*2,0,1)*(lab==BACK); col=tint(col,(0.97,0.99,1.02),g(vein,5)*0.25)
# ---- nails: a pink plate, paler towards its free edge ----
hc=np.array([np.mean(np.where(lab==BACK)[1]),np.mean(np.where(lab==BACK)[0])+250])
yy,xx=np.mgrid[0:H,0:W].astype(np.float32); plate=np.zeros((H,W,3),np.float32); edge=np.zeros((H,W),np.float32)
nl,_=ndi.label(nails)
for x,y,a in cen:
    i=nl[int(y),int(x)]; m=nl==i
    if i==0: continue
    d=np.array([x,y])-hc; d/=np.linalg.norm(d); t=(xx-x)*d[0]+(yy-y)*d[1]; tm=t[m]; f=(t-tm.min())/(tm.max()-tm.min()+1e-6)
    edge=np.where(m,np.clip((f-0.82)/0.1,0,1),edge)
    lun=np.clip((0.2-f)/0.12,0,1)
    plate[m]=(np.array([0.83,0.615,0.555])*(1-0.25*lun[m,None])+np.array([0.88,0.74,0.69])*0.25*lun[m,None])
plate=plate*(1-0.7*edge[...,None])+np.array([0.9,0.84,0.76],np.float32)*0.7*edge[...,None]
plate*= (1+0.02*noise(10))[...,None]
col=col*(1-nsoft[...,None])+plate*nsoft[...,None]
# ---- out: bled past the islands' edges so no black shows at a seam ----
out=np.clip(col,0,1); out[~mask]=0
idx=ndi.distance_transform_edt(~mask,return_distances=False,return_indices=True); outb=out[idx[0],idx[1]]
cv2.imwrite('fp_skin_albedo_v4e.png',(outb[...,::-1]*255+0.5).astype(np.uint8))
# roughness: skin as it was baked, nails smoother, creases a little rougher
R=R0.copy(); print('rough before', np.percentile(R0[mask],[5,50,95]))
R=np.full_like(R0,float(np.median(R0[mask])))*(1-away)+R0*away; R=np.clip(R+0.06*cr-0.03*rd,0,1); R=R*(1-nsoft)+0.3*nsoft
Rb=R[idx[0],idx[1]]; cv2.imwrite('fp_skin_rough_v4e.png',(Rb*255+0.5).astype(np.uint8))
prev=np.concatenate([A,outb],1); cv2.imwrite('../out/skin_new.jpg',(cv2.resize(prev,(2000,1000))[...,::-1]*255).astype(np.uint8))
print('mean new', out[mask].mean(0).round(3))
