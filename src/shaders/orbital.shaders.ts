const COMMON_COLOR_FN = `
  vec3 getOrbitalColor(float val) {
      vec3 base = vec3(1.0);

      if (uColorTheme == 2) {
          float t = abs(val) * 1.5;
          t = clamp(t, 0.0, 1.0);

          const vec3 c1 = vec3(0.0, 0.0, 0.0);
          const vec3 c2 = vec3(0.8, 0.1, 0.3);
          const vec3 c3 = vec3(1.0, 0.6, 0.1);
          const vec3 c4 = vec3(1.0, 1.0, 0.9);

          if (t < 0.33) base = mix(c1, c2, t * 3.0);
          else if (t < 0.66) base = mix(c2, c3, (t - 0.33) * 3.0);
          else base = mix(c3, c4, (t - 0.66) * 3.0);
      }
      else {
          base = mix(uColorNeg, uColorPos, step(0.0, val));
      }

      return base;
  }
`;

export const VERTEX_SHADER = `
  varying vec3 vOrigin;
  void main() {
    vOrigin = vec3(modelMatrix * vec4(position, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const FRAGMENT_SHADER = `
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uVolume;
  uniform vec3 uCameraPos;
  uniform float uIntensity;
  uniform float uGlow;
  uniform int uColorTheme;
  uniform vec3 uColorPos;
  uniform vec3 uColorNeg;
  uniform float uIsoLines;
  uniform float uShowCloud;
  uniform float uContourFreq;
  uniform float uSliceX;
  uniform float uSliceY;
  uniform float uSliceZ;
  uniform float uDithering;

  varying vec3 vOrigin;

  const float STEP_SIZE = 0.015;

  ${COMMON_COLOR_FN}

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec2 hitBox(vec3 origin, vec3 dir) {
    const vec3 boxMin = vec3(-1.0);
    const vec3 boxMax = vec3(1.0);
    vec3 tMin = (boxMin - origin) / dir;
    vec3 tMax = (boxMax - origin) / dir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
  }

  void main() {
    vec3 renderOrigin = vOrigin;
    vec3 rayDir = normalize(renderOrigin - uCameraPos);
    vec2 bounds = hitBox(uCameraPos, rayDir);

    if (bounds.x > bounds.y) discard;

    float tStart = max(bounds.x, 0.0);
    float tEnd = bounds.y;

    float jitter = random(gl_FragCoord.xy); 
    tStart += jitter * STEP_SIZE * uDithering;

    vec3 p = uCameraPos + tStart * rayDir;
    vec3 marchStep = rayDir * STEP_SIZE;

    vec4 colorAcc = vec4(0.0);
    float dist = tStart;

    bool showCloud = uShowCloud > 0.5;
    bool showIso = uIsoLines > 0.5;

    for(int i = 0; i < 150; i++) {
      if (dist > tEnd || colorAcc.a >= 0.98) break;

      if (p.x > uSliceX || p.y > uSliceY || p.z > uSliceZ) {
          p += marchStep;
          dist += STEP_SIZE;
          continue;
      }

      vec3 texCoord = p * 0.5 + 0.5;

      float val = texture(uVolume, texCoord).r;
      float density = val * val;

      if (density > 0.0001) {
        float alpha = 0.0;
        vec3 emission = vec3(0.0);
        vec3 baseColor = getOrbitalColor(val);

        if (showCloud) {
          alpha += density * uIntensity * 0.8;
          emission += baseColor * uGlow * (0.8 + density * 2.0);
        }

        if (showIso) {
            float contour = sin(density * uContourFreq);
            float line = smoothstep(0.9, 1.0, contour);
            emission += baseColor * line * 2.0;
            alpha += line * 0.3;
        }

        if (alpha > 0.001) {
            colorAcc.rgb += (1.0 - colorAcc.a) * alpha * emission;
            colorAcc.a += (1.0 - colorAcc.a) * alpha;
        }
      }

      p += marchStep;
      dist += STEP_SIZE;
    }

    if (colorAcc.a < 0.01) discard;

    gl_FragColor = colorAcc;
  }
`;

export const CSM_VERTEX_CHUNK = `
  varying vec3 vObjectPos;
  void main() {
    vObjectPos = position;
  }
`;

export const CSM_FRAGMENT_CHUNK = `
  uniform sampler3D uVolume;
  uniform int uColorTheme;
  uniform vec3 uColorPos;
  uniform vec3 uColorNeg;
  uniform float uMeshOffset;
  varying vec3 vObjectPos;

  ${COMMON_COLOR_FN}

  void main() {
    vec3 uvw = (vObjectPos + vec3(uMeshOffset)) * 0.5 + 0.5;
    float rawVal = texture(uVolume, uvw).r;

    csm_DiffuseColor.rgb = getOrbitalColor(rawVal);
  }
`;
