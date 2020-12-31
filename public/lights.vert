attribute vec2 a_Position;

uniform vec2 u_Res;
uniform float u_Size;
uniform float u_Speed;
uniform float u_Time;

void main() {
  gl_PointSize = u_Size;
  vec2 pos = a_Position * u_Res;
  gl_Position = vec4(pos.x, mod(pos.y + u_Time * u_Speed * 0.00001, 2.0) - 1.0, 0, 1);
}
