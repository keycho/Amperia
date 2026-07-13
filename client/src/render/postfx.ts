import Phaser from 'phaser';

/**
 * PP3 — the restrained WebGL post pipeline, applied to the WORLD camera only
 * (so UI, in its own scene/camera, is never touched). Exactly three effects:
 *
 *   (a) a subtle screen-space VIGNETTE,
 *   (b) an emissive-only BLOOM — a thresholded bright-pass (only pixels well
 *       above mid-brightness bloom, which on this scene is the additive light
 *       layer: lamps, the Dynamo, neon signage, string lights). The base
 *       frame passes through UNTOUCHED and the soft bloom is only ADDED on
 *       top, so ink contours stay razor-sharp,
 *   (c) a gentle warm/cool COLOUR GRADE locking the "night market at night"
 *       balance (warm shadows/mids, a hair cooler in the brightest highlights).
 *
 * The base is sampled at exact texel centres (no blur of the source), so the
 * pixel grid and integer upscale are preserved. Bloom is a luminance-threshold
 * bright-pass, not a separately-rendered emissive buffer — on this scene the
 * additive glows are by far the brightest pixels, so it isolates to the light
 * layer in practice.
 */

const FRAG = `
#define SHADER_NAME WORLD_GRADE_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uVignette;
uniform float uThreshold;
uniform float uBloom;
uniform float uGrade;
varying vec2 outTexCoord;

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// Keep only the part of a colour whose luminance is above the threshold.
vec3 brightPass(vec3 c){
  float k = max(0.0, luma(c) - uThreshold) / max(0.0001, 1.0 - uThreshold);
  return c * k;
}

void main(){
  vec2 uv = outTexCoord;
  vec3 base = texture2D(uMainSampler, uv).rgb;

  // (b) emissive bloom — thresholded bright-pass over two TIGHT rings
  // (bloom tune: radius down so a lamp's halo stays ~1.5x the bulb).
  vec2 px = 1.0 / uResolution;
  vec3 bloom = vec3(0.0);
  for (int i = 0; i < 12; i++){
    float a = (float(i) + 0.5) * 0.5235988; // 2*PI/12
    vec2 dir = vec2(cos(a), sin(a));
    bloom += brightPass(texture2D(uMainSampler, uv + dir * px * 1.5).rgb) * 0.7;
    bloom += brightPass(texture2D(uMainSampler, uv + dir * px * 3.0).rgb) * 0.4;
  }
  bloom /= 12.0;

  // (c) gentle warm/cool grade.
  vec3 warmed = base * vec3(1.05, 1.0, 0.93);
  vec3 cooled = base * vec3(0.98, 1.0, 1.04);
  float hi = smoothstep(0.6, 1.0, luma(base));
  vec3 graded = mix(base, mix(warmed, cooled, hi), uGrade);

  // (a) subtle vignette.
  float r = length(uv - 0.5) * 1.2;
  float vig = mix(1.0, smoothstep(0.95, 0.35, r), uVignette);

  // Bloom keeps HUE (bloom tune): saturate the halo toward the emitter's
  // colour so overlapping halos never accumulate to white...
  vec3 b = bloom * uBloom;
  float bl = luma(b);
  b = max(mix(vec3(bl), b, 1.45), 0.0);
  // ...and cap the summed pixel below clipping inside the halo (uniform
  // scale preserves hue). Near-white stays reserved for the emitter's own
  // core pixels, which arrive already bright in the base frame.
  vec3 cb = graded * vig;
  float m = max(b.r, max(b.g, b.b));
  float room = 0.95 - min(0.95, max(cb.r, max(cb.g, cb.b)));
  b *= m > 0.0001 ? min(1.0, room / m) : 1.0;
  gl_FragColor = vec4(cb + b, 1.0);
}
`;

export class WorldGradePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, name: 'WorldGrade', fragShader: FRAG });
  }

  onPreRender(): void {
    this.set1f('uVignette', 0.5);
    // Bloom tune: threshold up so only true emitters bloom (never their
    // in-scene halos), strength cut ~47% — the halo is modest by design.
    this.set1f('uThreshold', 0.8);
    this.set1f('uBloom', 0.45);
    this.set1f('uGrade', 0.5);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}

const PIPE = 'WorldGrade';

/** Attach the post pipeline to a scene's main camera (WebGL only). */
export function installWorldPostFX(scene: Phaser.Scene): void {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return; // Canvas: no post FX
  if (!renderer.pipelines.postPipelineClasses.has(PIPE)) {
    renderer.pipelines.addPostPipeline(PIPE, WorldGradePipeline);
  }
  scene.cameras.main.setPostPipeline(PIPE);
}

/** Detach the post pipeline from a scene's main camera. */
export function removeWorldPostFX(scene: Phaser.Scene): void {
  scene.cameras.main.resetPostPipeline();
}

/** Apply the current setting to a scene's main camera. */
export function applyWorldPostFX(scene: Phaser.Scene, on: boolean): void {
  if (on) installWorldPostFX(scene);
  else removeWorldPostFX(scene);
}
