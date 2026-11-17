// "Why use this?" (T5) for the tools that are not registry effects, in the syllabus's words.
export const WHY = {
  // ---- Video mode ----
  aspectRatio:
    'The aspect ratio is the ratio of the width of each frame to its height. 16:9 is used by almost all screens today. If a 4:3 video is shown on a 16:9 screen without black bars, it is stretched and looks distorted, so set it for the screen the audience will use.',
  trim: 'Trimming removes unwanted footage from the start or end of a clip, so the video shows only what the audience needs and is the length the task asks for.',
  split:
    'Splitting cuts a clip in two at the playhead, so a part in the middle can be removed or something can be put between the parts. Joining (splicing) puts clips back together into one.',
  remove:
    'Deleting takes away a clip the video does not need. What comes after it moves up, so no gap is left.',
  duration:
    'A still image, title or caption has no length of its own: its duration decides how long the audience sees it. Long enough to read, short enough to keep their attention.',
  speed:
    'Speeding a clip up shows a long event in a short time (time-lapse); slowing it down shows detail in fast movement (slow motion). The clip becomes shorter or longer.',
  turn: 'Turning puts a clip or picture the right way up: phone footage filmed sideways or upside down is turned 90° or 180°, so the audience does not have to tilt their head. Flipping mirrors the picture, for example so a person faces into the frame. A clip turned on its side has black bars unless the project has its shape.',
  clipSound:
    'Removing a clip’s own sound takes away wind, traffic or talking the audience should not hear, so music or a voiceover can be heard clearly. Lowering its volume keeps a little background sound.',
  separateSound:
    'Separating the sound puts it on its own track, so it can be moved, trimmed or deleted without changing the picture — for example to keep the sound playing over the next clip.',
  title:
    'A text slide (title) introduces the video or a new part of it, so the audience knows what they are about to watch.',
  caption:
    'Captions show words on top of the video: they name a place or a person, and they help viewers who are deaf or hard of hearing, or who watch with the sound off.',
  subtitle:
    'Subtitles show what is being said, at the bottom of the picture. They help viewers who are deaf or hard of hearing, who speak another language, or who watch with the sound off.',
  credits:
    'Credits name the people who made the video and the sources of the clips, music and pictures that were used. Scrolling credits need blank lines so each part can be read.',
  resizeCrop:
    'Resizing and cropping a still image makes it match the video’s aspect ratio, so it fills the frame without black bars or looking stretched. Cropping also removes unwanted parts of the picture.',
  placePicture:
    'Placing a picture on another makes one still from both: a still from the video or a logo on a background, for a title slide or the credits. It is saved as a new picture, so both originals are kept.',
  overlay:
    'Putting a picture or a video over the video shows two things at once. A logo or watermark in a corner shows who made the video, often for the whole video. Picture-in-picture shows a small video in a corner, for example a presenter talking while the screen they explain fills the frame. Keep it small and near an edge, so it does not hide what matters.',
  fade: 'Fading from black gently opens a scene; fading to black closes it and shows that time has passed or that the video is ending. Fading to white feels bright, like a memory.',
  panZoom:
    'Pan and zoom moves across or into a picture so a still image does not look frozen. It also removes unwanted parts at the edges and draws attention to an important detail.',
  filters:
    'Filters change the look of a clip: correct colours that are wrong, make clips match, or create a mood — black and white for the past, a cyan tone for cold, blur to hide details.',
  transition:
    'A transition decides how one clip changes into the next. A plain cut is quick; dissolves and fades are smoother. Too many different transitions distract the audience.',
  snapshot:
    'A still holds an important moment on screen. It can be a background for captions or credits, or be edited in an image editor and put back into the video.',
  audio:
    'Sound gets an emotional response from the viewer: music sets the mood, a voiceover (narration) explains what is happening, and sound effects emphasise the action. Lowering the music under the voice keeps the words clear.',
  export:
    'Not every device plays every format, so choose the one the audience will use: MP4 for the web and phones, WMV for Windows, MPG for a DVD player. A smaller size and lossy compression make the file quick to send or stream; lossless keeps a perfect master copy that is much bigger.',
  // ---- Audio mode ----
  splitAudio:
    'Splitting cuts an audio clip in two at the playhead, so one part can be moved, deleted or have another sound put between the parts. Joining (splicing) puts two clips that touch back together into one.',
  moveClip:
    'Moving a clip along its track changes when it plays, for example to start a voiceover at the right moment in the music. Dragging a clip’s edge trims its start or end; drag it back out to get the sound back.',
  deleteClip:
    'Deleting a clip takes away a sound the project does not need. The gap it leaves is silent, and the clips after it stay where they are.',
  cutCopyPaste:
    'Cut removes the selected sound and keeps it to paste somewhere else; Copy keeps a copy without removing it; Paste puts it in at the cursor. Together they move or repeat a part of a clip.',
  trimAudio:
    'Trimming removes unwanted material: Trim to selection keeps only the selected sound, so silence, coughs or extra music at the start and end are gone.',
  silence:
    'Silence gives a pause: room between two pieces of music, before a voiceover starts, or to replace a sudden noise without changing the timing of what comes after it.',
  addTrack:
    'Each sound on its own track — music, a voiceover, sound effects — can be moved, trimmed and made louder or quieter on its own, then mixed together.',
  moveTrack:
    'Moving a track up or down changes only the order they are shown in, so the tracks that belong together can be seen and selected together. It does not change the sound.',
  align:
    'Aligning places tracks exactly in time: end to end splices two clips into one after the other with no gap; start to cursor or zero lines a sound up with a moment in another track.',
  mix: 'Mix and render combines the selected tracks into one, exactly as they sound together, so the result can be edited as one clip or exported.',
  mono: 'Mono has one channel, played the same through every speaker. It halves the file size, and suits speech, phone calls and a single speaker; stereo gives music a sense of space.',
  removeTrack:
    'Removing a track takes away a sound that is not needed — for example the original tracks after they have been mixed and rendered into one.',
  recording:
    'Overdubbing records a new track — such as a voiceover — while the other tracks play, so the narration fits the music and the moments it talks about.',
  audioExport:
    'Export makes a file that plays on other devices; the project itself only opens in OneEditor. A lossy format (MP3, AAC) makes a small file for streaming, phones and email; a lossless one (WAV, FLAC) keeps the sound exactly. A lower sample rate, bit rate or mono makes the file smaller but loses quality.',
  // ---- Animation mode (20.1) ----
  stage:
    'The stage is the area where the animation happens: only what is on it is seen. Its size in pixels and its aspect ratio (4:3, 16:9, 16:10, 2.35:1) are set for where the animation will be shown — a web page, a widescreen TV, a phone — and its colour is the background of every frame.',
  rulersGrid:
    'Rulers show the coordinates in pixels (0, 0 is the top left), so objects can be placed exactly where a task says. The grid and guides help line objects up with each other; they are only shown while working and never appear in the exported animation.',
  snapping:
    'Snapping pulls an object you move onto the nearest grid line (while the grid is shown), guide, edge or centre of another object, so things line up exactly without typing numbers. Hold Alt to move freely.',
  vectorShapes:
    'Vector objects are stored as points and equations, so they can be moved, resized, turned and recoloured without losing quality, and the computer can work out the frames in between (tweening). A bitmap picture cannot be tweened the same way.',
  animText:
    'Text is an object like any other: it has a font, size, colour and position, and it can be moved, faded and tweened. Splitting a word into letters lets each letter arrive or leave on its own. Curving the words bends them along an arch, as in many logos, so each letter does not have to be placed and turned by hand.',
  animTrace:
    'Trace bitmap turns a picture into vector shapes, one for each area of colour, so its parts can be recoloured, moved and animated separately and it can be resized without blurring. Some detail is lost: fewer colours and less detail give fewer, simpler shapes.',
  animPicture:
    'A picture (bitmap) can be placed, moved, resized and faded in an animation. To change its parts separately, trace it into vector shapes first; some detail is lost in the trace. Cropping keeps only the part needed; making a plain background see-through cuts the subject out (a transparent background), so no mask is needed to hide it.',
  objectProperties:
    'An object’s properties — its position (x, y), size, rotation, opacity, fill and stroke — decide how it looks in a frame. Tasks give exact values, so they are typed here: the fill is the colour inside (a gradient blends two or more colours, across or out from a centre), the stroke is the outline, and opacity is how see-through it is (0 % invisible, 100 % solid). Skew slants it in its box: ↔ leans it as italic letters lean, ↕ drops one side (a shield turned sideways). Turn about sets the point it turns about, in % of its box from the top left (or drag the dot with a cross on the stage): a meter’s needle or a clock’s hand turns about its end, a pendulum about its top, a door about its hinge.',
  animLayers:
    'Each layer has its own timeline, so the objects on it are animated independently of the others. The top layer is in front. Locking a layer stops accidental changes; hiding it keeps it out of the way while working. Objects that must move separately — each leg of a stick person — go on separate layers.',
  animGroup:
    'A group makes several objects move, turn and scale as one, while each part can keep its own animation — a car’s wheels turn while the car drives. The parts of an animated object are its animation variables.',
  animTimeline:
    'The timeline shows the frames; a keyframe fixes a value at a frame and the frames in between are generated (inbetweening, or tweening). Easing makes a change start or end gently; a hold keeps a value until the next keyframe, as in frame-by-frame animation.',
  animPath:
    'A motion path is the line an object follows between two frames, so it can move along a curve, such as a car on a winding road. Orient to path turns the object with the path, as the car turns with the road.',
  animMorph:
    'Morphing (shape tweening) changes one shape into another, with every in-between shape generated: a circle can become a square, or a cloud a sun. The colour, size and position can change at the same time.',
  animMask:
    'A mask is a layer whose shapes decide what can be seen of the layer beneath it: only the parts under the shapes show. A moving mask, such as a spotlight, reveals the picture or the words as it passes.',
  animButton:
    'Buttons let the viewer control the animation: Pause stops it so a picture can be studied, Continue plays on, Restart plays it again and Go to frame jumps to a part. They work in an HTML web animation (and in Test); a video or GIF cannot be clicked, so there they are only pictures of buttons.',
  animStopMotion:
    'Stop motion makes still photographs move: an object (a clay model, a toy) is moved a little between photographs, and the photographs are shown one after another, a few each second. Import frames puts a folder of them on a layer, each held for its frames; 12 pictures a second is smooth enough and halves the photographs needed for 24.',
  animFrameByFrame:
    'Frame-by-frame animation draws every keyframe separately, as the pages of a flip book or the cels of cel animation: it gives complete control over every change (a face changing expression, a flowchart step lighting up) but takes far longer than a tween. Duplicate frame copies the drawing to change it a little; onion skin shows the drawings before and after faintly to keep the steps even.',
  animLibrary:
    'The library gives ready-made pictures, icons and backgrounds drawn as vector shapes, so a scene can be built quickly and every part (a wheel, an eye, a cloud) can still be recoloured and animated on its own. The background is a secondary component; the characters are the primary ones.',
  animEffects:
    'An effect adds the keyframes of a common motion in one click: a fade or a fly-in brings an object on, a fade or a fly-out takes it away, and a pulse, shake or spin draws the eye to it. The computer works out the frames in between (tweening), and the keyframes can still be changed on the timeline.',
  animExport:
    'Export turns the animation into a file for where it will be seen: an MP4 video for a computer, phone or video site (an AVI for older Windows software, a MOV for Apple’s); an animated GIF or an HTML page for a web page; a PNG sequence or a single PNG for further editing. A part (a range of frames) or a smaller size can be exported when a task asks for one.',
  // ---- Graphics mode (M18, syllabus 19) ----
  graphicImage:
    'The canvas is the picture you draw on: its size in pixels decides how much detail it holds, and its resolution (dots per inch) how big it prints. 300 dpi suits print, so an A4 page is 2480 × 3508 pixels; a screen needs only its own pixels, so a web logo can be 200 × 200 px at 96 dpi. Too low a resolution looks blocky (pixelated) when printed; too high makes big files that are slow to load. A transparent background lets the logo sit on any colour.',
  graphicLayers:
    'Layers hold the parts of an image on top of each other, like pieces of paper, so each part can be moved or changed without affecting the others. The top layer is in front. Locking a layer stops accidental changes; hiding it keeps it out of the way. A mask layer shows the layer beneath only through its shapes (a photo inside a circle).',
  graphicNodes:
    'Nodes are the points a vector shape’s outline passes through; their handles bend the curves between them. A cusp makes a sharp point (each handle on its own), a smooth node a flowing curve (the handles in line, each its own length: asymmetrical) and a symmetrical node an even curve (in line and the same length). Editing nodes changes the shape itself: a rectangle flared at the bottom, a traced outline made exact, a brush stroke simplified to a few nodes so it is smooth and quick to change.',
  graphicEnvelope:
    'An envelope bends a whole shape at once into another outline: an arch or a bulge for a badge, a wave for a flag, a rectangle flared into a road or a roller-coaster track. Perspective drags the four corners so a flat shape seems to lie back into the distance, its far end smaller. The bend stays live, so the shape can still be changed underneath, until Apply makes it ordinary paths whose nodes can be edited. Moving every node by hand would be slow and seldom even.',
  graphicAlign:
    'Align puts the edges or centres of objects in line, and distribute makes the space between three or more of them the same. A drawing then looks neat without measuring by eye: legs evenly spaced, buttons in a row. Relative to the canvas, one object is centred on it or put against an edge. Moving them by hand is slower and less exact.',
  graphicExport:
    'Export makes a file for where the image will be used. SVG keeps the shapes as vectors, so it can be any size without blurring: logos, icons, drawings. PNG keeps every pixel (lossless) and transparency: sharp edges, text, logos on a web page. JPG makes photographs small by losing detail you hardly see (lossy) and has no transparency. A part can be exported on its own, and the size can be a width or height in pixels, or a printed size at a resolution.',
  graphicSend:
    'Most graphics are made to be animated next: Send to Animation puts the drawing into Animation mode as editable shapes on a layer of its own, where it was drawn, so each part can still be moved, recoloured and tweened. Copy and Paste work between the two modes too.',
  outlineView:
    'The outline view shows every shape as a thin line, with no fills, so parts hidden under others can be seen, checked and selected: a bite cut out of an apple, a stalk behind a leaf, two shapes that should meet exactly. It only changes how the stage looks while working; the image and its exports are unchanged.',
  templateLayer:
    'A template is a picture placed faded and locked under the drawing, to trace over by hand with the pen and shapes: the drawing then has the right shape and proportions, and it stays vector. The template is only a guide, so it is never exported or sent to Animation mode.',
  graphicPattern:
    'A pattern fills a shape with a tile repeated: stripes, checks, dots, hatching, bricks or a picture. It shows a material (a brick wall, a woven basket, a checked cloth) without drawing every part, and stays a vector, so it is sharp at any size. The fill and the outline can each be made see-through on their own, so a shape can be pale but its outline strong.',
  graphicFilters:
    'Filters give flat shapes depth. A drop shadow lifts an object off the background; an inner shadow sinks it in; a glow makes a halo or a light bloom round it; a bevel lights one side and shades the other, for raised lettering, 3-D buttons and metal; a stroke draws an outline round whatever is drawn (outside, centred on or inside its edge), even round a photo clipped into a shape or a whole layer; a blur softens its edges. They change only how it is drawn, so the shape can still be edited, and in an SVG they stay filters.',
  graphicShapes:
    'Arcs, spirals and polylines are drawn exactly, as vector shapes, instead of by hand: an arc is part of an ellipse (the scale of a meter, a slice of a cake), left open, closed to the centre like a pie slice or straight across like a chord; a spiral goes round as many times as chosen, evenly or opening out; a polyline is straight lines clicked point to point, with Shift keeping them at 15° steps. Each can still be changed in Properties.',
  graphicCurves:
    'Convert to curves turns a shape (a rectangle, ellipse, arc, star or polygon) into a path of nodes and curves that looks the same, so every point can then be moved on its own: a star’s arm pulled out, a corner of a rounded rectangle made square, a circle squeezed into a leaf. The shape loses what made it a rectangle or a star (its corner radius, its number of points), so do it once its size and corners are right.',
  graphicReplicate:
    'Replication makes exact, evenly spaced copies instead of placing each one by eye. Step and repeat makes several copies at once, each moved and turned by the same amount: the spokes of a wheel round its hub, the legs of a chip along its side. Duplicate again after moving a copy repeats that move. Paste in place puts a copy exactly where the original is (on another layer, say), and Mirror copy makes the other half of a symmetrical drawing.',
  textSpacing:
    'Spacing makes words fit and read well. Letter spacing (tracking) opens up or closes up the whole text evenly: wide for a calm heading or a logo, tight to fit a name in a space. Kerning moves just two letters closer or apart, where their shapes leave a gap that looks too big or too small (AV, To). Line spacing sets how far apart the lines are: more for easy reading, less for a compact title. Spacing is in thousandths of the letters’ size, so it grows and shrinks with them.',
  textPath:
    'Text on a path makes words follow a line or go round a shape: round a badge or a logo, along the curve of a guitar or a road, over an arc. The letters stay text, so the words, font and size can still be changed. Start moves the words along the path; Side puts them outside it, hanging inside it, or centred so the outline runs through each letter; Flip runs them the other way (along the bottom of a circle, reading left to right). The path itself is usually hidden, so only the words show its shape.',
  textShape:
    'Text in a shape wraps the lines inside an outline (a circle, a speech bubble, a star) instead of a rectangle, so the block of words takes the shape of the design. Padding keeps the words away from the edge so they are easy to read. If not all the words fit, make the text smaller, the padding less or the shape bigger: words that do not fit are not shown.',
  textCurves:
    'Convert to curves turns text into the shapes of its letters, each a path of nodes and curves taken from the font itself, so a letter can be stretched, bent or reshaped as a drawing (a long tail on a “Q”, a logo’s letters joined). The words then look the same on any computer, even one without the font, but they can no longer be typed into: change the words, font and size first.',
  textWarp:
    'Warping bends the words into a shape, an arch over a logo, a bulge or a wave, while they are still text: the words, the font and the size can still be changed and the bend follows. Apply makes the bent letters ordinary paths. Effects such as a drop shadow, a glow or a bevel make the words stand out from what is behind them.',
  // ---- Graphics mode, pixel layers (M21) ----
  graphicPaint:
    'Painting changes the pixels of a photo or a drawing by hand: the brush paints with a soft or hard edge, the pencil sets each pixel exactly (pixel art, a 1 px line), the airbrush builds up colour gently the longer it is held (a glow, a shadow), and the eraser takes pixels away to transparent. The size, hardness, opacity, flow and spacing change how each stroke looks, and a shape such as a star or a scatter of dots paints many stars and lights in one stroke (a night scene). A preset keeps a brush to use again; on a layer mask, black hides and white shows without losing any pixels.',
  graphicFill:
    'The paint bucket fills an area of one colour with another in one click (a sea recoloured light blue, land made green): the tolerance says how alike the colours must be, and contiguous fills only the pixels joined to the one clicked. The gradient tool fills the layer or the selection with colours that blend into each other along a line dragged across it, straight (linear) or out from a centre (radial), for a sky, a light, or a logo fading from light to dark.',
  graphicTransform:
    'Transforming a photo or part of one places it exactly where it is needed: moved so its edge sits on a line, scaled to fit a gap (with its proportions kept, so it is not stretched), turned to line up with the picture behind it, flipped to face the other way, or skewed to lean. Typed numbers are exact where dragging is not. Every change to a bitmap makes new pixels from the old (resampling): bicubic keeps photos smooth and sharp, nearest neighbour keeps the hard edges of pixel art; quarter turns and flips only move pixels, so nothing is lost.',
  graphicAdjust:
    'Adjustments change the colours and light of a whole photo (or the selected part) at once, as a photographer would: greyscale or black and white for an old or a dramatic look, brightness and contrast or levels to rescue a dull or dark photo, exposure to give it more or less light, shadows and highlights to show detail in the dark and bright parts without spoiling the rest, colour balance or temperature and tint to warm a cold picture or take away a colour cast, hue and saturation to make colours stronger or recolour something (colourise turns a grey Moon gold), and replace colour to change one colour only (the darker colours made brighter). Each is previewed before it is applied, is one undo step, and on a layer mask changes how much of the layer shows.',
  graphicBlur:
    'Blurring and sharpening change how much detail shows. A Gaussian blur softens a whole photo or the selected part: a background made soft so the subject stands out, a face or a number plate hidden, a harsh edge smoothed. Motion blur streaks the picture along a line, so something still looks as if it is moving fast; zoom blur streaks it out from a point, as if rushing towards it. Sharpen (an unsharp mask) makes edges crisper by making each side of an edge a little darker or lighter: the amount says how much, the radius how wide the edges are, and the threshold leaves small differences such as skin and noise alone. Too much blur loses detail that cannot be got back; too much sharpening shows bright halos.',
  graphicDistort:
    'Distorting moves the pixels of a photo instead of changing their colours. A twirl turns the middle of a circle round its centre, most at the centre and less towards the edge, for a swirl or a whirlpool; a bulge magnifies the inside of a circle like a lens or a magnifying glass (a pinch shrinks it). Perspective moves the four corners so the picture looks flat on a wall or a screen seen at an angle, or straightens a building photographed from below; a warp bends the picture with a mesh of points, to fit it round a mug or a flag. Done inside a selection only that part changes, and each is one undo step.',
  graphicClone:
    'The clone stamp and the heal brush take unwanted things out of a photo by painting over them with another part of the same photo: Alt-click (Option-click on a Mac) a clean place to copy from, such as empty sky, sea, sand or wall, then paint over the bin, the post, the wires or the person. The clone stamp copies the pixels exactly, so it suits patterns, edges and busy textures such as leaves; the heal brush copies them and then matches the colour and light of the place around the stroke, so the repair blends in on smooth surfaces such as sky, sea and skin, where a copy from a lighter or darker place would show. Aligned keeps the same distance between the brush and the source from stroke to stroke; a selection round the part to repair keeps the heal from borrowing colour from what is next to it. A good repair cannot be seen: the papers ask for the rubbish, posts and wires removed without cropping the picture.',
  graphicRetouch:
    'The blur, sharpen and smudge brushes change only the places they are painted on, not the whole photo: the blur brush softens a hard edge, a blemish or a distracting detail; the sharpen brush brings out detail in one part, such as the eyes in a portrait; the smudge brush drags colour along the stroke as a finger drags wet paint, to blend a join or give a soft, painted look. The strength says how much each stroke does, and going over again does more. Red eye removal fixes the red pupils a camera flash makes: click the middle of the eye, or drag a box over it, and only the red there is made dark and grey, so the skin and the white of the eye stay as they were.',
  animSound:
    'Sound is a secondary component of an animation: an alarm ringing, a door slamming or music under the action tells the audience what is happening and when. Each sound starts at a frame, so it is heard in time with the movement; a fade in or out stops it starting or ending suddenly. An MP4, AVI, MOV or web page carries the sounds; a GIF and pictures cannot.',
} as const;

export type ToolId = keyof typeof WHY;

export interface Tool {
  id: ToolId;
  label: string;
  /** The syllabus point, in its words (11.1 video, 11.2 audio). */
  syllabus: string;
  why: string;
}

const tool = (id: ToolId, label: string, syllabus: string): Tool => ({
  id,
  label,
  syllabus,
  why: WHY[id],
});

/** Every editing tool that is not a registry effect, with its syllabus point and why (T5). */
export const TOOLS: Tool[] = [
  tool('aspectRatio', 'Aspect ratio', '11.1 setting an aspect ratio'),
  tool('trim', 'Trim', '11.1 trimming a video clip'),
  tool('split', 'Split and join', '11.1 splicing / joining video clips'),
  tool('remove', 'Delete', '11.1 trimming a video clip'),
  tool('duration', 'Duration', '11.1 inserting a still image'),
  tool('speed', 'Speed', '11.1 altering the speed of a video clip'),
  tool('turn', 'Turn & flip', '11.1 setting an aspect ratio'),
  tool('clipSound', 'Clip sound', '11.1 removing audio from a video clip'),
  tool('separateSound', 'Separate sound', '11.1 editing audio within a video clip'),
  tool('title', 'Title', '11.1 creating text-based slides'),
  tool('caption', 'Caption', '11.1 adding captions'),
  tool('subtitle', 'Subtitles', '11.1 adding subtitles'),
  tool('credits', 'Credits', '11.1 creating credits'),
  tool('resizeCrop', 'Resize & crop', '11.1 resizing and cropping a still image'),
  tool('placePicture', 'Place a picture', '11.1 inserting a still image'),
  tool('overlay', 'Over the video', '11.1 inserting a still image'),
  tool('fade', 'Fade', '11.1 adding fading effects'),
  tool('panZoom', 'Pan & zoom', '11.1 adding pan and zoom effects'),
  tool('filters', 'Filters & colour', '11.1 using filters and colour correction'),
  tool('transition', 'Transition', '11.1 adding transitions'),
  tool('snapshot', 'Snapshot', '11.1 extracting a still image'),
  tool('audio', 'Music & voiceover', '11.1 adding audio to a video clip'),
  tool('export', 'Export video', '11.1 exporting · compressing to different resolutions'),
  tool('splitAudio', 'Split and join audio', '11.2 splicing / joining audio clips'),
  tool('moveClip', 'Move and trim a clip', '11.2 trimming an audio clip'),
  tool('deleteClip', 'Delete a clip', '11.2 trimming an audio clip'),
  tool('cutCopyPaste', 'Cut, copy & paste', '11.2 splicing / joining audio clips'),
  tool('trimAudio', 'Trim to selection', '11.2 trimming an audio clip'),
  tool('silence', 'Insert silence', '11.2 trimming an audio clip'),
  tool('addTrack', 'New track', '11.2 importing new tracks · adding a track'),
  tool('moveTrack', 'Move track', '11.2 adding a track to an audio clip'),
  tool('align', 'Align', '11.2 splicing / joining audio clips'),
  tool('mix', 'Mix and render', '11.2 adding a track to an audio clip'),
  tool('mono', 'Stereo to mono', '11.2 changing stereo to mono'),
  tool('removeTrack', 'Remove track', '11.2 adding a track to an audio clip'),
  tool('recording', 'Record', '11.2 overdubbing, including voiceover'),
  tool('audioExport', 'Export audio', '11.2 exporting · sample rates'),
  tool('stage', 'Stage settings', '20.1 configuring the stage'),
  tool('rulersGrid', 'Rulers, grid & guides', '20.1 rulers, guides and grid'),
  tool('snapping', 'Snapping', '20.1 snapping options'),
  tool('vectorShapes', 'Vector shapes', '20.1 creating vector objects'),
  tool('animText', 'Text', '20.1 adding text'),
  tool('animPicture', 'Picture', '20.1 importing and tracing bitmaps'),
  tool('animTrace', 'Trace bitmap', '20.1 importing and tracing bitmaps'),
  tool('objectProperties', 'Object properties', '20.1 controlling object properties'),
  tool('animLayers', 'Layers', '20.1 using layers'),
  tool('animGroup', 'Group', '20.1 animation variables'),
  tool('animTimeline', 'Timeline and keyframes', '20.1 frames, key frames and tweening'),
  tool('animPath', 'Motion path', '20.1 setting paths'),
  tool('animMorph', 'Morph', '20.1 morphing'),
  tool('animMask', 'Mask', '20.1 applying masks'),
  tool('animButton', 'Button', '20.1 controlling animations by stopping them'),
  tool('animStopMotion', 'Import frames (stop motion)', '20.1 stop motion'),
  tool('animFrameByFrame', 'Frame-by-frame layer', '20.1 frames, key frames and tweening'),
  tool('animLibrary', 'Library', '20.1 creating vector objects'),
  tool('animEffects', 'Effects', '20.1 frames, key frames and tweening'),
  tool('animExport', 'Export animation', '20.1 exporting an animation'),
  tool('animSound', 'Sound', '20.1 components of an animation'),
  tool(
    'graphicImage',
    'Image size and resolution',
    '19.1 the need for different image resolutions',
  ),
  tool('graphicLayers', 'Layers', '19.1 graphics tools: layers'),
  tool('graphicNodes', 'Nodes', '19.2 nodes: cusp, smooth and symmetrical'),
  tool('graphicAlign', 'Align and distribute', '19.1 alignment and distribution tools'),
  tool('graphicEnvelope', 'Envelope and perspective', '19.2 envelopes and perspective'),
  tool('graphicExport', 'Export image', '19.1 exporting an image in different file formats'),
  tool('graphicSend', 'Send to Animation', '19.2 creating a vector graphic for its application'),
  tool(
    'graphicShapes',
    'Arc, spiral and polyline',
    '19.2 vector shapes: arcs, spirals and polylines',
  ),
  tool('graphicCurves', 'Convert to curves', '19.2 convert to curves and replication'),
  tool(
    'graphicReplicate',
    'Step and repeat, mirror copy',
    '19.2 convert to curves and replication',
  ),
  tool('outlineView', 'Outline view', '19.2 creating a vector graphic for its application'),
  tool('templateLayer', 'Template layer', '19.2 creating a vector graphic for its application'),
  tool('graphicPattern', 'Pattern fill and opacity', '19.1 changing solid and gradient fills'),
  tool('graphicFilters', 'Filters', '19.1 changing solid and gradient fills'),
  tool(
    'textSpacing',
    'Letter spacing, kerning and line spacing',
    '19.5 font, size, kerning and spacing',
  ),
  tool('textPath', 'Text on a path', '19.5 fitting text to a path or shape'),
  tool('textShape', 'Text in a shape', '19.5 setting text in a shape'),
  tool('textCurves', 'Text to curves', '19.5 converting text to curves'),
  tool('textWarp', 'Warped text', '19.5 warping text'),
  tool('graphicPaint', 'Brush, pencil, airbrush and eraser', '19.3 brush, pencil and pen tools'),
  tool('graphicFill', 'Paint bucket and gradient', '19.1 changing solid and gradient fills'),
  tool('graphicTransform', 'Transform pixels', '19.3 creating and editing bitmap images'),
  tool('graphicAdjust', 'Adjustments', '19.3 working with colour'),
  tool('graphicClone', 'Clone stamp and heal', '19.3 tools/filters to alter parts of an image'),
  tool(
    'graphicRetouch',
    'Blur, sharpen and smudge brushes, red eye',
    '19.3 tools/filters to alter parts of an image',
  ),
  tool('graphicBlur', 'Blur and sharpen', '19.3 tools/filters to alter parts of an image'),
  tool(
    'graphicDistort',
    'Twirl, bulge, perspective and warp',
    '19.3 tools/filters to alter parts of an image',
  ),
];

export function toolById(id: ToolId): Tool {
  return TOOLS.find((t) => t.id === id)!;
}

/** N17: a "Why use this?" text arranged to read at a glance: a short answer, then its reasons. */
export interface Explained {
  answer: string;
  reasons: string[];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
/** Where a long first sentence divides: a list after a colon, ", so …", or an example. */
const DIVIDE = /^(.*?)(?::\s+|,\s+(?=so\s)|\s+—\s+(?=for example)|,\s+(?=for example))(.+)$/s;

/**
 * Splits a why-text into its first sentence (the answer) and the rest (the reasons); a first
 * sentence that is the only one divides at a colon, ", so" or "for example". The words are kept
 * exactly; only the arrangement changes.
 */
export function explain(text: string): Explained {
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-Z“"(])/);
  const first = sentences[0] ?? '';
  const reasons = sentences.slice(1);
  const parts = DIVIDE.exec(first);
  if (!parts || (reasons.length > 0 && first.length <= 150)) return { answer: first, reasons };
  return { answer: sentence(parts[1]!), reasons: [capital(parts[2]!), ...reasons] };
}

/** A toolbar button's or menu item's tooltip: what it does, then why it is used (T5). */
export const withWhy = (tip: string, id: ToolId): string => `${tip}\n\nWhy? ${WHY[id]}`;
