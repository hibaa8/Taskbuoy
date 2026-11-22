"""Compose the Taskbuoy ad from RunComfy footage/audio and exact app screenshots.
Inputs live in release-assets/runcomfy-ad; generation is separate and never billed here.
"""
from pathlib import Path
import subprocess, json
root=Path(__file__).resolve().parents[1]
a=root/'release-assets/runcomfy-ad'; a.mkdir(parents=True,exist_ok=True)
screens=root/'release-assets/taskbuoy-delivery'
mark=a/'brand-source.png'
if not mark.exists(): mark=root/'extension/icon.png'
bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
regular='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
navy='0x080c36'; white='0xf4f5fc'; peri='0xb5b5fa'; amber='0xffb000'
def run(args): subprocess.run(args,check=True)
def duration(p):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(p)],text=True))
# Normalize three generated 10-second clips, avoiding a missing or short last frame.
for i in range(1,4):
 run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(a/f'shot{i}.mp4'),'-an','-vf','scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=10','-t','10','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4',str(a/f'base{i}.mp4')])
(a/'bases.txt').write_text(''.join(f"file '{a/f'base{i}.mp4'}'\n" for i in range(1,4)))
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(a/'bases.txt'),'-c','copy',str(a/'motion.mp4')])
scenes=[
 {'start':0,'duration':4.2,'title':'ONE QUICK\nSCROLL?','sub':'Then another. Sound familiar?','label':'THE TAB SPIRAL','image':None,'size':148},
 {'start':4,'duration':4.2,'title':'Meet\nTaskbuoy.','sub':'Your next small step starts here.','label':'A CHROME EXTENSION','image':None,'size':142},
 {'crop':'crop=360:280:920:510,scale=820:-1','px':880,'py':220,'pw':820,'ph':638,'start':8,'duration':6.2,'title':'Catch the drift.\nCome back.','sub':'Visible reminders.\nA clear way back to work.','label':'CATCH DISTRACTING TABS','image':'Taskbuoy_02_Reminder_1280x800.png','size':76},
 {'crop':'crop=350:450:925:340,scale=-1:700','px':1045,'py':187,'pw':544,'ph':700,'start':14,'duration':6.2,'title':'One task.\nReal momentum.','sub':'Keep your timer in sight.\nReturn to what matters.','label':'MAKE TIME FOR YOUR WORK','image':'Taskbuoy_04_Timer_1280x800.png','size':76},
 {'start':20,'duration':5.2,'title':'Find your\nrhythm.','sub':'See where your time goes.\nYour records stay on your device.','label':'YOUR DAY, IN PERSPECTIVE','image':'Taskbuoy_01_Dashboard_1280x800.png','size':88},
 {'start':25,'duration':5,'title':'Less drift.\nMore done.','sub':'Taskbuoy for Chrome','label':'MAKE ROOM FOR WHAT MATTERS','image':None,'size':142},
]
for i,s in enumerate(scenes):
 for k in ['title','sub','label']:(a/f'{i}-{k}.txt').write_text(s[k])
 args=['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(s['start']),'-i',str(a/'motion.mp4'),'-loop','1','-i',str(mark)]
 if s['image']: args+=['-loop','1','-i',str(screens/s['image'])]
 # The generated backdrop supplies motion; legible interface content is always the original capture.
 f=[f'[0:v]trim=duration={s["duration"]},setpts=PTS-STARTPTS,gblur=sigma=16,eq=saturation=0.65,drawbox=x=0:y=0:w=iw:h=ih:color={navy}@0.78:t=fill[bg]', '[1:v]scale=66:66,format=rgba[mark]', '[bg][mark]overlay=x=76:y=56:shortest=1[brand]']
 x,y=76,(284 if s['image'] else 284)
 layer='brand'
 if s['image']:
  px,py,pw,ph=s.get('px',716),s.get('py',187),s.get('pw',1120),s.get('ph',700)
  crop=s.get('crop','scale=1120:700')
  f += [f'[2:v]{crop},format=rgba,fade=t=in:st=0.22:d=0.3:alpha=1[ui]', f'[brand]drawbox=x={px-10}:y={py-10}:w={pw+20}:h={ph+20}:color=0xb5b5fa@0.32:t=2[frame]', f'[frame][ui]overlay=x={px}:y={py}:shortest=1[screen]'];layer='screen'
 else:
  # A large genuine logo acts as the second focal point; its on-device icon stays exact.
  f += ['[1:v]scale=360:360,format=rgba,fade=t=in:st=0.18:d=0.38:alpha=1[hero]', f'[{layer}][hero]overlay=x=1430:y=315:shortest=1[heroed]'];layer='heroed'
 alpha="if(lt(t,0.12),0,min(1,(t-0.12)/0.28))"
 footer='Actual Taskbuoy interface · illustrative demo records' if s['image'] else 'Chrome extension · Local records · Your control'
 f += [f"[{layer}]drawtext=fontfile={bold}:text='Taskbuoy':fontsize=38:fontcolor={white}:x=160:y=65,drawtext=fontfile={regular}:text='CHROME EXTENSION':fontsize=20:fontcolor={peri}:x=1545:y=76,drawtext=fontfile={bold}:textfile={a}/{i}-label.txt:fontsize=19:fontcolor={amber}:x={x}:y=215:alpha='{alpha}',drawtext=fontfile={bold}:textfile={a}/{i}-title.txt:fontsize={s['size']}:line_spacing=12:fontcolor={white}:x='{x}-32*pow(max(0,1-t/0.4),3)':y={y}:alpha='{alpha}',drawtext=fontfile={regular}:textfile={a}/{i}-sub.txt:fontsize={31 if s['image'] else 36}:line_spacing=14:fontcolor={peri}:x={x}:y={570 if s['image'] else 665}:alpha='min(1,max(0,(t-0.35)/0.35))',drawbox=x={x}:y=748:w=480:h=7:color={amber}:t=fill,drawtext=fontfile={regular}:text='{footer}':fontsize=19:fontcolor={peri}:x=76:y=995[v]"]
 args += ['-filter_complex',';'.join(f),'-map','[v]','-an','-t',str(s['duration']),'-r','30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4','-filter_complex_threads','2',str(a/f'scene{i}.mp4')];run(args)
# Crossfades preserve a precise 30 seconds while keeping each section readable.
args=['ffmpeg','-hide_banner','-loglevel','error','-y']
for i in range(6):args+=['-i',str(a/f'scene{i}.mp4')]
f=[];prev='0:v'
for i,t in enumerate([4,8,14,20,25],1):
 nxt=f'x{i}';f.append(f'[{prev}][{i}:v]xfade=transition=fade:duration=0.2:offset={t}[{nxt}]');prev=nxt
args += ['-filter_complex',';'.join(f),'-map',f'[{prev}]','-an','-t','30','-r','30','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-threads','4','-filter_complex_threads','2',str(a/'picture.mp4')];run(args)
voice_len=duration(a/'voice.wav');tempo=voice_len/25.0
# A small speed adjustment fits the narration naturally, then music ducks under it.
filters=f"[1:a]atempo={tempo:.6f},adelay=350|350,apad,atrim=duration=30,asplit=2[vo][duck];[2:a]atrim=duration=30,asetpts=PTS-STARTPTS,volume=0.32,afade=t=in:st=0:d=0.25,afade=t=out:st=28.7:d=1.3[m];[m][duck]sidechaincompress=threshold=0.025:ratio=5:attack=15:release=220[bed];[bed][vo]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=9[a]"
output=root/'release-assets/Taskbuoy_Ad_30s_RunComfy_1080p.mp4'
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(a/'picture.mp4'),'-i',str(a/'voice.wav'),'-i',str(a/'music.wav'),'-filter_complex',filters,'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t','30','-movflags','+faststart',str(output)])
print(json.dumps({'output':str(output),'duration':duration(output),'narration_source_duration':voice_len,'voice_tempo':tempo}))
