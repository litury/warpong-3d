import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

// ---------------------------------------------------------------------------
// Inline GLSL shaders registered into Babylon's Effect store
// ---------------------------------------------------------------------------

Effect.ShadersStore["energyShieldVertexShader"] = /* glsl */ `
  precision highp float;

  // Attributes
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;

  // Uniforms (Babylon built-ins)
  uniform mat4 world;
  uniform mat4 worldViewProjection;
  uniform mat4 worldView;
  uniform float uTime;
  uniform float uBendAmount;

  // Varyings
  varying vec3 vLocalPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vPlaneUV;

  void main() {
    // Bend the flat plane into a curved shield (like a curved monitor)
    float bend = position.x * position.x * uBendAmount;
    vec3 bentPos = position;
    bentPos.z -= bend;

    // Recompute normal after bending
    float dx = 2.0 * position.x * uBendAmount;
    vec3 bentNormal = normalize(vec3(dx, 0.0, 1.0));

    vLocalPosition = bentPos;
    vNormal = normalize(mat3(world) * bentNormal);
    vViewDir = normalize(-(worldView * vec4(bentPos, 1.0)).xyz);

    // Use flat position.xy for hex grid — perfect mapping on a plane
    vPlaneUV = position.xy;

    // Subtle energy field shimmer
    float wobble = sin(bentPos.y * 0.08 + uTime * 2.0) * 0.3
                 + sin(bentPos.x * 0.12 - uTime * 3.0) * 0.15;
    vec3 displacedPos = bentPos + bentNormal * wobble;

    gl_Position = worldViewProjection * vec4(displacedPos, 1.0);
  }
`;

Effect.ShadersStore["energyShieldFragmentShader"] = /* glsl */ `
  precision highp float;

  varying vec3 vLocalPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vPlaneUV;

  uniform float uTime;
  uniform vec3  uColor;
  uniform float uAlpha;
  uniform float uFresnelPower;
  uniform float uHexScale;
  uniform vec2  uShieldSize;

  uniform vec3  uImpactPoint;
  uniform float uImpactTime;

  uniform sampler2D uPatternTex;

  // -----------------------------------------------------------------------
  // Hex grid (proper two-grid approach with hex SDF)
  // -----------------------------------------------------------------------
  vec4 hexCoords(vec2 p, float size) {
    vec2 s = vec2(1.0, 1.7320508);
    p /= size;
    vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw)
      ? vec4(h.xy, hc.xy)
      : vec4(h.zw, hc.zw + 0.5);
  }

  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, vec2(0.8660254, 0.5)), p.y);
  }

  // -----------------------------------------------------------------------
  // Impact ripple (local space)
  // -----------------------------------------------------------------------
  float impactRipple(vec3 pos, vec3 hitPoint, float hitTime, float now) {
    float elapsed = now - hitTime;
    if (elapsed < 0.0 || elapsed > 2.0) return 0.0;
    float dist = length(pos - hitPoint);
    float radius = elapsed * 80.0;
    float ring = smoothstep(8.0, 0.0, abs(dist - radius));
    return ring * exp(-2.5 * elapsed);
  }

  // -----------------------------------------------------------------------
  // Main — cinematic multi-layer sci-fi shield
  // -----------------------------------------------------------------------
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    N = faceforward(N, -V, N);

    // --- Normalized UV for edge fade (0..1 range) ---
    vec2 nUV = vPlaneUV / uShieldSize * 0.5 + 0.5;

    // --- Edge fade: soft borders ---
    float edgeFadeX = smoothstep(0.0, 0.2, nUV.x) * smoothstep(1.0, 0.8, nUV.x);
    float edgeFadeY = smoothstep(0.0, 0.15, nUV.y) * smoothstep(1.0, 0.85, nUV.y);
    float edgeFade = edgeFadeX * edgeFadeY;

    // --- Layer 1: Hex grid edges (subtle) ---
    vec4 h = hexCoords(vPlaneUV, uHexScale);
    float d = hexDist(h.xy);
    float edge = smoothstep(0.45, 0.5, d);
    float pulse = 0.85 + sin(length(h.zw) * 3.0 - uTime * 3.0) * 0.15;
    float hexLayer = edge * 0.8 * pulse;

    // --- Layer 2: Scrolling pattern texture (energy sparkles) ---
    vec2 patternUV1 = vPlaneUV * 0.04 + vec2(uTime * 0.1, uTime * 0.25);
    vec2 patternUV2 = vPlaneUV * 0.06 + vec2(-uTime * 0.15, uTime * 0.1);
    float pattern1 = texture2D(uPatternTex, patternUV1).r;
    float pattern2 = texture2D(uPatternTex, patternUV2).r;
    float patternLayer = (pattern1 * 0.5 + pattern2 * 0.3) * edgeFade;

    // --- Layer 3: Scanline energy flow ---
    float scanline = smoothstep(0.4, 0.5, fract(vPlaneUV.y * 0.25 + uTime * 1.2)) * 0.3;

    // --- Layer 4: Subtle noise shimmer ---
    float noise = fract(sin(dot(vPlaneUV * 0.08 + uTime * 0.3, vec2(12.9898, 78.233))) * 43758.5453);
    float noiseLayer = noise * 0.05;

    // --- Fresnel (double: color + alpha) ---
    float colorFres = pow(1.0 - abs(dot(N, V)), uFresnelPower);
    float alphaFres = pow(1.0 - abs(dot(N, V)), 3.0);

    // --- Impact ripple ---
    float ripple = impactRipple(vLocalPosition, uImpactPoint, uImpactTime, uTime);

    // --- Combine all layers ---
    float baseIntensity = (hexLayer + patternLayer + scanline + noiseLayer) * edgeFade;
    float intensity = baseIntensity + colorFres * 0.4 + ripple * 1.5;

    // Color: bright emissive tint + fresnel brightens toward white
    vec3 color = uColor * 2.0 * baseIntensity + uColor * 2.5 * colorFres * 0.4;
    color += vec3(1.0) * ripple * 0.6;

    // Alpha: translucent interior, bright edges and fresnel
    float alpha = clamp(intensity * uAlpha + alphaFres * 0.2, 0.0, 0.8) * edgeFade;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createEnergyShieldMaterial(
  name: string,
  scene: Scene,
  color: Color3,
): ShaderMaterial {
  const mat = new ShaderMaterial(name, scene, {
    vertex: "energyShield",
    fragment: "energyShield",
  }, {
    attributes: ["position", "normal", "uv"],
    uniforms: [
      "world", "worldView", "worldViewProjection",
      "uTime", "uColor", "uAlpha",
      "uFresnelPower", "uHexScale", "uShieldSize",
      "uImpactPoint", "uImpactTime",
      "uBendAmount",
    ],
    samplers: ["uPatternTex"],
    needAlphaBlending: true,
  });

  // Default uniform values
  mat.setFloat("uTime", 0);
  mat.setColor3("uColor", color);
  mat.setFloat("uAlpha", 0.6);
  mat.setFloat("uFresnelPower", 2.0);
  mat.setFloat("uHexScale", 10.0);
  mat.setVector3("uImpactPoint", new Vector3(0, 0, 0));
  mat.setFloat("uImpactTime", -10.0);
  mat.setFloat("uBendAmount", 0.0003);

  // Transparency / blending
  mat.backFaceCulling = false;
  mat.alphaMode = Constants.ALPHA_COMBINE;
  mat.disableDepthWrite = true;

  return mat;
}

export function triggerShieldImpact(
  material: ShaderMaterial,
  mesh: Mesh,
  worldImpactPoint: Vector3,
  currentTime: number,
): void {
  // Convert world-space impact point to local/object space
  const invWorld = Matrix.Invert(mesh.getWorldMatrix());
  const localPoint = Vector3.TransformCoordinates(worldImpactPoint, invWorld);
  material.setVector3("uImpactPoint", localPoint);
  material.setFloat("uImpactTime", currentTime);
}

export function updateShieldTime(material: ShaderMaterial, time: number): void {
  material.setFloat("uTime", time);
}
