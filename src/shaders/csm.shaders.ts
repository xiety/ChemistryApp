import { COMMON_COLOR_FN } from './orbital.shaders';

export const MESH_VERTEX_SHADER = `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
  }
`;

export const MESH_FRAGMENT_SHADER = `
  precision highp float;
  precision highp sampler3D;
  precision highp sampler2D;

  uniform sampler3D uVolume;
  uniform sampler2D uGradientMap;
  uniform float uUseAbsoluteVal;
  uniform float uTexOffset;

  uniform float uSliceX;
  uniform float uSliceY;
  uniform float uSliceZ;

  varying vec3 vLocalPosition;

  ${COMMON_COLOR_FN}

  void main() {
    if (vLocalPosition.x > uSliceX || vLocalPosition.y > uSliceY || vLocalPosition.z > uSliceZ) {
        discard;
    }

    vec3 uvw = vLocalPosition * 0.5 + 0.5 + uTexOffset;
    float val = texture(uVolume, uvw).r;
    vec3 col = getOrbitalColor(val);

    csm_DiffuseColor = vec4(col, csm_DiffuseColor.a);
  }
`;
