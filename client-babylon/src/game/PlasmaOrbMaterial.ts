import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

// ---------------------------------------------------------------------------
// Inline GLSL shaders — plasma orb (warp energy sphere)
// ---------------------------------------------------------------------------

Effect.ShadersStore.plasmaOrbVertexShader = /* glsl */ `
  precision highp float;

  attribute vec3 position;
  attribute vec3 normal;

  uniform mat4 world;
  uniform mat4 worldViewProjection;
  uniform mat4 worldView;
  uniform float uTime;
  uniform float uNoiseScale;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  void main() {
    // Vertex displacement — surface "boils"
    float n = sin(position.x * uNoiseScale + uTime * 2.5)
            * sin(position.y * uNoiseScale + uTime * 3.1)
            * sin(position.z * uNoiseScale + uTime * 1.8);
    float displacement = n * 0.06;

    vec3 displaced = position + normal * displacement;

    vLocalPos = position;
    vNormal = normalize(mat3(world) * normal);
    vViewDir = normalize(-(worldView * vec4(displaced, 1.0)).xyz);

    gl_Position = worldViewProjection * vec4(displaced, 1.0);
  }
`;

Effect.ShadersStore.plasmaOrbFragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  uniform float uTime;
  uniform vec3  uColor;
  uniform float uAlpha;
  uniform float uFresnelPower;
  uniform float uNoiseScale;
  uniform float uImpactTime;

  // Layered procedural noise for "boiling" plasma surface
  float plasmaPattern(vec3 p, float t) {
    float n1 = sin(p.x * 4.0 + t * 2.0) * sin(p.y * 4.0 - t * 1.5) * sin(p.z * 4.0 + t * 1.8);
    float n2 = sin(p.x * 8.0 - t * 3.0) * sin(p.y * 8.0 + t * 2.5) * sin(p.z * 8.0 - t * 2.0);
    float n3 = sin(p.x * 2.0 + t * 1.0) * sin(p.z * 2.0 - t * 0.8);
    return n1 * 0.5 + n2 * 0.25 + n3 * 0.25;
  }

  // Impact ripple — bright flash on hit
  float impactFlash(float hitTime, float now) {
    float elapsed = now - hitTime;
    if (elapsed < 0.0 || elapsed > 0.6) return 0.0;
    // Quick flash that fades out
    return exp(-6.0 * elapsed) * (0.5 + 0.5 * sin(elapsed * 30.0));
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // Fresnel — bright edge glow
    float fresnel = pow(1.0 - abs(dot(N, V)), uFresnelPower);

    // Plasma noise pattern
    float pattern = plasmaPattern(vLocalPos * uNoiseScale, uTime);
    float intensity = 0.5 + pattern * 0.5; // remap to 0..1

    // Global pulse
    float pulse = 0.85 + sin(uTime * 3.0) * 0.1 + sin(uTime * 5.7) * 0.05;
    intensity *= pulse;

    // Impact flash
    float flash = impactFlash(uImpactTime, uTime);

    // Color: green warp core, edges go toward white
    vec3 coreColor = uColor * 2.0 * intensity;
    vec3 edgeColor = mix(uColor * 3.0, vec3(1.0), 0.4) * fresnel;
    vec3 flashColor = vec3(0.8, 1.0, 0.8) * flash * 2.0;

    vec3 finalColor = coreColor + edgeColor + flashColor;

    // Alpha: solid core, bright Fresnel edges
    float alpha = clamp(intensity * uAlpha + fresnel * 0.5 + flash * 0.3, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createPlasmaOrbMaterial(
  name: string,
  scene: Scene,
  color: Color3,
): ShaderMaterial {
  const mat = new ShaderMaterial(
    name,
    scene,
    {
      vertex: "plasmaOrb",
      fragment: "plasmaOrb",
    },
    {
      attributes: ["position", "normal"],
      uniforms: [
        "world",
        "worldView",
        "worldViewProjection",
        "uTime",
        "uColor",
        "uAlpha",
        "uFresnelPower",
        "uNoiseScale",
        "uImpactTime",
      ],
      needAlphaBlending: true,
    },
  );

  mat.setFloat("uTime", 0);
  mat.setColor3("uColor", color);
  mat.setFloat("uAlpha", 0.9);
  mat.setFloat("uFresnelPower", 2.5);
  mat.setFloat("uNoiseScale", 3.0);
  mat.setFloat("uImpactTime", -10.0);

  mat.backFaceCulling = false;
  mat.alphaMode = Constants.ALPHA_ADD;
  mat.disableDepthWrite = true;

  return mat;
}

export function triggerOrbImpact(
  material: ShaderMaterial,
  currentTime: number,
): void {
  material.setFloat("uImpactTime", currentTime);
}

export function updateOrbTime(
  material: ShaderMaterial,
  time: number,
): void {
  material.setFloat("uTime", time);
}
