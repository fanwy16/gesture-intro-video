# gesture-intro-video

An agent skill for recording a self-introduction video: you talk to your webcam, pick your work up into the frame with your hands, and explain it in the style of an app you love. Figma's style is built in; your agent can restyle it for any other app. One sentence per scene, with a teleprompter.

一个 agent skill：对着摄像头讲话，用手势把作品"拿"进画面，用你喜欢的 app 的界面风格讲解。自带 Figma 风格，也可以让 agent 换成任何 app 的风格。每句一场，带提词器。

## Install

Works with any agent that reads `SKILL.md` skills (Claude Code, Codex and others). Put this folder where your agent loads skills, for example with Claude Code:

```
git clone https://github.com/fanwy16/gesture-intro-video ~/.claude/skills/gesture-intro-video
```

Claude app: download the repo as a ZIP (Code → Download ZIP), then Settings → Capabilities → Skills → upload it.

Then ask: "Make a Figma-style intro video from my storyboard", or name another app.

Needs Node 20+, Chrome and a webcam. The Figma MCP server is optional and only needed for the storyboard steps.

## License

MIT. Fonts and MediaPipe are installed from npm under their own licenses. Not affiliated with Figma or any app it imitates.
