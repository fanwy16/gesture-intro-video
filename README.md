# gesture-intro-video

A Claude skill for recording a self-introduction video: you talk to your webcam, pick your work up into the frame with your hands, and explain it with Figma-style motion. One sentence per scene, with a teleprompter.

一个 Claude skill：对着摄像头讲话，用手势把作品"拿"进画面，配上 Figma 风格的动效讲解。每句一场，带提词器。

## Install

Claude Code:

```
git clone https://github.com/fanwy16/gesture-intro-video ~/.claude/skills/gesture-intro-video
```

Claude app: download the repo as a ZIP (Code → Download ZIP), then Settings → Capabilities → Skills → upload it.

Then ask Claude: "Make a Figma-style intro video from my storyboard."

Needs Node 20+, Chrome and a webcam. The Figma MCP server is optional and only needed for the storyboard steps.

## License

MIT. Fonts and MediaPipe are installed from npm under their own licenses. Not affiliated with Figma.
