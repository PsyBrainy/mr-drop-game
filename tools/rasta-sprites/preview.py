import sys
from build import *
from PIL import ImageDraw
BOX={'light_ground':((7,45),(17,47),[4,5,6]),'light_air':((3,45),(15,53),[5,6,7,8]),'heavy':((8,60),(12,56),[12,13,14,15])}
def prev(names, path, k=4):
    Z = F // W  # px de hoja por px de arte (1 desde A0)
    rows=[]
    for n in names:
        fr=ANIMS[n]
        hitposes=set()
        if n in BOX: hitposes={TABLES[n][i] for i in BOX[n][2]}
        tiles=[]
        for i,f in enumerate(fr):
            b=Image.new('RGBA',f.size,(88,104,122,255)); b.alpha_composite(f)
            d=ImageDraw.Draw(b)
            # hurtbox
            d.rectangle([(OX-16)*Z,(OY-56)*Z,(OX+16)*Z-1,OY*Z-1],outline=(80,200,255))
            d.line([0,OY*Z,F,OY*Z],fill=(0,0,0))
            if i in hitposes:
                (x0,x1),(y0,y1),_=BOX[n]
                d.rectangle([(OX+x0)*Z,(OY-y1)*Z,(OX+x1)*Z-1,(OY-y0)*Z-1],outline=(255,60,60))
            tiles.append(b)
        rows.append(tiles)
    Wd=max(len(r) for r in rows)*F; Hd=len(rows)*F
    s=Image.new('RGBA',(Wd,Hd),(30,30,30,255))
    for j,r in enumerate(rows):
        for i,t in enumerate(r): s.paste(t,(i*F,j*F))
    s.resize((s.width*k,s.height*k),Image.NEAREST).save(path)
if __name__=='__main__':
    prev(sys.argv[2].split(','), sys.argv[1], int(sys.argv[3]) if len(sys.argv)>3 else 2)
