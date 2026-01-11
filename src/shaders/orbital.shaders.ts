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
  uniform float uIsoLines;
  uniform float uShowCloud;
  uniform float uContourFreq;
  uniform float uSliceX;
  uniform float uSliceY;
  uniform float uSliceZ;

  varying vec3 vOrigin;

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

  vec3 getEmissionColor(float val, float density) {
      vec3 base = vec3(1.0);
      
      if (uColorTheme == 0) {
          vec3 colPos = vec3(0.2, 0.6, 1.0);
          vec3 colNeg = vec3(1.0, 0.2, 0.2);
          base = mix(colNeg, colPos, step(0.0, val));
      } 
      else if (uColorTheme == 1) {
          float t = sqrt(density) * 1.5;
          t = clamp(t, 0.0, 1.0);
          vec3 c1 = vec3(0.0, 0.0, 0.0);
          vec3 c2 = vec3(0.8, 0.1, 0.3); // Deep red
          vec3 c3 = vec3(1.0, 0.6, 0.1); // Orange
          vec3 c4 = vec3(1.0, 1.0, 0.9); // White
          
          if (t < 0.33) base = mix(c1, c2, t * 3.0);
          else if (t < 0.66) base = mix(c2, c3, (t - 0.33) * 3.0);
          else base = mix(c3, c4, (t - 0.66) * 3.0);
      }
      else {
          vec3 colPos = vec3(0.0, 1.0, 0.6); // Neon Mint
          vec3 colNeg = vec3(0.8, 0.0, 1.0); // Neon Purple
          base = mix(colNeg, colPos, step(0.0, val));
      }
      
      return base;
  }

  void main() {
    vec3 rayDir = normalize(vOrigin - uCameraPos);
    vec2 bounds = hitBox(uCameraPos, rayDir);

    if (bounds.x > bounds.y) discard;

    float tStart = max(bounds.x, 0.0);
    float tEnd = bounds.y;

    vec3 p = uCameraPos + tStart * rayDir;
    vec3 marchStep = rayDir * 0.015;
    
    vec4 colorAcc = vec4(0.0);
    float dist = tStart;
    
    for(int i = 0; i < 150; i++) {
      if (dist > tEnd || colorAcc.a >= 0.98) break;
      
      if (p.x > uSliceX || p.y > uSliceY || p.z > uSliceZ) {
          p += marchStep;
          dist += 0.015;
          continue;
      }

      vec3 texCoord = p * 0.5 + 0.5;
      float val = texture(uVolume, texCoord).r;
      float density = val * val; 
      
      if (density > 0.0001) {
        float alpha = 0.0;
        vec3 emission = vec3(0.0);
        vec3 baseColor = getEmissionColor(val, density);
        
        if (uShowCloud > 0.5) {
          alpha += density * uIntensity * 0.8; 
          emission += baseColor * uGlow * (0.8 + density * 2.0);
        }

        if (uIsoLines > 0.5) {
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
      dist += 0.015;
    }

    if (colorAcc.a < 0.01) discard;

    gl_FragColor = colorAcc;
  }
`;
