import cv2, numpy as np, subprocess, math
src='images/2.jpg'; out='/home/user/motionProject/output/faris_welcome_15s.mp4'
im=cv2.imread(src); h,w=im.shape[:2]; fps=30; n=15*fps
yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
def g(c,s,a): return np.exp(-((a-c)/s)**2)
# torso mask (chest/shoulders/arms), smooth falloff, zero on background edges
torso=(g(560,260,xx)*g(950,330,yy)).astype(np.float32)
head=(g(560,170,xx)*g(400,230,yy)).astype(np.float32)
cmd=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',str(fps),'-i','-',
     '-c:v','libx264','-preset','slow','-crf','12','-vf','scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int','-pix_fmt','yuv420p',
     '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',out]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for i in range(n):
    t=i/fps
    b=0.5-0.5*math.cos(2*math.pi*t/4.2)          # breathing cycle ~4.2s
    sway=math.sin(2*math.pi*t/9.0)               # very slow micro-sway
    dy=torso*(-2.0*b)+head*(-1.2*b)              # chest rises, head follows slightly
    dx=torso*(0.6*sway)+head*(0.8*sway)
    mx=xx-dx; my=yy-dy
    f=cv2.remap(im,mx,my,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT)
    mask=(torso+head)<1e-3
    f[mask]=im[mask]                             # background pixels untouched
    p.stdin.write(f.tobytes())
p.stdin.close(); p.wait()
