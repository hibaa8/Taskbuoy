"""Render the store promo from real UI screenshots. Requires ffmpeg; no external media."""
from pathlib import Path
import subprocess, math, wave, struct, json
root=Path(__file__).resolve().parents[1]
out=root/'release-assets';screens=out/'screenshots';tmp=out/'render-source';tmp.mkdir(parents=True,exist_ok=True)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
serif='/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
scenes=[
 {'seconds':4,'heading':'Make room for\nwhat matters.','caption':'A Chrome extension for a little less drift.'},
 {'seconds':6,'heading':'Choose your\nintention.','caption':'Set a session.\nKeep your timer in view.\nCome back to your work.','image':'04-focus-side-coach-1280x800.png','number':'01 / YOUR INTENTION'},
 {'seconds':6,'heading':'Catch the\nscroll.','caption':'A visible reminder.\nAn optional chime.\nA clear way back.','image':'02-distraction-reminder-1280x800.png','number':'02 / A GENTLE NUDGE'},
 {'seconds':6,'heading':'See where\nyour time goes.','caption':'Review your day.\nReflect on your progress.\nChoose your next step.','image':'01-focus-dashboard-1280x800.png','number':'03 / YOUR DAILY RHYTHM'},
 {'seconds':5,'heading':'Make it\nyour own.','caption':'Choose distracting sites.\nApprove useful ones.\nSet the support you need.','image':'03-focus-settings-1280x800.png','number':'04 / ON YOUR TERMS'},
 {'seconds':4,'heading':'One task.\nA little less drift.','caption':'Taskbuoy for Chrome\nLocal records. No account required.'}
]
for i,scene in enumerate(scenes):
 for key in ['heading','caption']:(tmp/f'{i}-{key}.txt').write_text(scene[key])
 duration=scene['seconds'];args=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i',f'color=c=0xf4f5fc:s=1920x1080:r=30:d={duration}']
 filters=[]
 if scene.get('image'):
  args+=['-loop','1','-i',str(screens/scene['image'])]
  filters+=['[1:v]scale=1216:760,setsar=1[screen]','[0:v]drawbox=x=628:y=185:w=1220:h=764:color=0x202640@0.12:t=fill[shadow]','[shadow][screen]overlay=x=620:y=176:shortest=1[base]']
  x,y,size,cy=74,290,64,540
 else:
  filters+=['[0:v]null[base]'];x,y,size,cy=230,275,112,620
 filters.append(f"[base]drawtext=fontfile={font}:text='TASKBUOY':fontsize=30:fontcolor=0x4846a3:x=74:y=64:alpha='min(t/0.4,1)',drawtext=fontfile={serif}:textfile={tmp}/{i}-heading.txt:fontsize={size}:line_spacing=16:fontcolor=0x202640:x={x}:y={y}:alpha='min(t/0.5,1)',drawtext=fontfile={font}:textfile={tmp}/{i}-caption.txt:fontsize={30 if scene.get('image') else 38}:line_spacing=16:fontcolor=0x656c89:x={x}:y={cy}:alpha='min(t/0.8,1)'[text]")
 if scene.get('image'):
  filters.append(f"[text]drawtext=fontfile={font}:text='{scene['number']}':fontsize=19:fontcolor=0x6a718d:x=74:y=210,drawtext=fontfile={font}:text='Actual extension interface / demo data':fontsize=21:fontcolor=0x6a718d:x=620:y=960[finished]")
 else:filters.append('[text]null[finished]')
 filters.append(f'[finished]fade=t=in:st=0:d=0.2,fade=t=out:st={duration-0.25}:d=0.25,format=yuv420p[video]')
 args+=['-filter_complex',';'.join(filters),'-map','[video]','-t',str(duration),'-an','-c:v','libx264','-preset','fast','-crf','19','-threads','2',str(tmp/f'scene-{i}.mp4')]
 subprocess.run(args,check=True)
(tmp/'concat.txt').write_text(''.join(f"file '{tmp/f'scene-{i}.mp4'}'\n" for i in range(len(scenes))))
seconds=sum(s['seconds'] for s in scenes);rate=22050
with wave.open(str(tmp/'original-soundtrack.wav'),'wb') as w:
 w.setparams((1,2,rate,0,'NONE','not compressed'))
 chords=[(130.813,164.814,195.998),(110,130.813,164.814),(87.307,130.813,174.614),(97.999,123.471,146.832)]
 frames=bytearray()
 for n in range(seconds*rate):
  t=n/rate;block=int(t/4)%4;u=t%4;env=min(1,u/.6)*min(1,(4-u)/1.0)
  a=sum(.025*env*math.sin(2*math.pi*f*t) for f in chords[block])
  for start,f in [(0,659.25),(.24,830.61),(.48,987.77),(seconds-3,659.25),(seconds-2.76,830.61),(seconds-2.52,987.77)]:
   d=t-start
   if 0<=d<.8:a+=.08*math.sin(2*math.pi*f*d)*min(1,d/.02)*math.exp(-5*d)
  a*=min(1,t/.3)*min(1,(seconds-t)/1.0)
  frames.extend(struct.pack('<h',int(max(-1,min(1,a))*32767)))
 w.writeframes(frames)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(tmp/'concat.txt'),'-i',str(tmp/'original-soundtrack.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(out/'Taskbuoy_Promo_1080p.mp4')],check=True)
(out/'promo-storyboard.json').write_text(json.dumps({'durationSeconds':seconds,'width':1920,'height':1080,'fps':30,'scenes':scenes,'soundtrack':'Original synthesized music; no third-party footage or music.'},indent=2))
print('Rendered',out/'Taskbuoy_Promo_1080p.mp4')
