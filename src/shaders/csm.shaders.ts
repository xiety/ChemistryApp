import { COMMON_COLOR_FN } from './orbital.shaders';

export const CSM_VERTEX_CHUNK = `
  varying vec3 vPos;
  void main() {
    vPos = position;
  }
`;

export const CSM_FRAGMENT_CHUNK = `
  precision highp float;
  precision highp sampler3D;
  precision highp sampler2D;

  varying vec3 vPos;
  uniform sampler3D uVolume;

  uniform sampler2D uGradientMap;
  uniform float uUseAbsoluteVal;

  uniform float uSliceX;
  uniform float uSliceY;
  uniform float uSliceZ;

  uniform float uTexOffset;

  ${COMMON_COLOR_FN}

  void main() {
    if (vPos.x > uSliceX || vPos.y > uSliceY || vPos.z > uSliceZ) {
        discard;
    }

    vec3 uvw = vPos * 0.5 + 0.5 + uTexOffset;
    float val = texture(uVolume, uvw).r;

    vec3 col = getOrbitalColor(val);

    csm_DiffuseColor = vec4(col, opacity);
  }
`;
