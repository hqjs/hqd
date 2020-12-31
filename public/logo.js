/**
 * Copyright © 2018 hqjs
 */

import GL from './gl-utils.js';
import Memory from './memory-vectors.js';

const WIDTH = 1680;

class Logo {
  constructor(element, stars = [{
    amount: 120,
    size: 1,
    speed: 15,
  }, {
    amount: 40,
    size: 2,
    speed: 7,
  }, {
    amount: 15,
    size: 3,
    speed: 5,
  }]) {
    this.element = element;
    this.stars = stars;

    this.calcSize();

    this._onResize = () => this.onResize();

    this.memory = new Memory({
      positions: {
        group: this.stars.reduce((res, { amount }, index) => {
          res[`stars-${index}`] = {
            init: (i, vec) => vec.rand([ -this.freeWidth, -this.freeHeight ], [ this.freeWidth, this.freeHeight ]),
            size: (amount * this.width / WIDTH) | 0,
          };
          return res;
        }, {}),
        type: Memory.Float32Vec2,
      },
    });

    (async () => {
      const vertexShaderPromise = fetch('/-/public/lights.vert').then(res => res.text());
      const fragmentShaderPromise = fetch('/-/public/lights.frag').then(res => res.text());

      const [ vertexShader, fragmentShader ] = await Promise.all([
        vertexShaderPromise,
        fragmentShaderPromise,
      ]);

      this.startTime = Date.now();

      this.gl = new GL({
        height: this.height,
        selector: this.element,
        width: this.width,
      });
      this.gl.enableAlpha();
      this.gl.context.clearColor(0, 0, 0, 0);
      this.gl.createVertexShader('particles', vertexShader);
      this.gl.createFragmentShader('particles', fragmentShader);
      this.gl.createProgram('main', 'particles', 'particles');
      this.gl.releaseFrameBuffer();
      this.mainProgram = this.gl.useProgram('main');

      this._initData();
      this.animate();

      this.subscribeEvents();
    })();
  }

  calcSize() {
    this.height = this.element.parentNode.clientHeight;
    this.width = this.element.parentNode.clientWidth;
    const maxRes = Math.max(this.width, this.height);
    this.resolution = [
      this.height / maxRes,
      this.width / maxRes,
    ];
    this.freeWidth = 1 / this.resolution[0];
    this.freeHeight = 1 / this.resolution[1];
  }

  _initData() {
    this.mainProgram.attachUniform({
      data: this.resolution,
      name: 'u_Res',
      type: '2fv',
    });
    this.mainProgram.attachUniform({
      data: 0,
      name: 'u_Speed',
      type: '1f',
    });
    this.mainProgram.attachUniform({
      data: this.startTime,
      name: 'u_Time',
      type: '1f',
    });
    this.mainProgram.attachUniform({
      data: 1,
      name: 'u_Size',
      type: '1f',
    });
    this.positionsBuffer = this.gl.createBuffer('positions', this.memory.views.positions);
    this.mainProgram.attachAttribute({
      dtype: this.gl.context.STATIC_DRAW,
      name: 'a_Position',
    });
  }

  render() {
    for (const [ index, { size, speed }] of this.stars.entries()) {
      this.mainProgram.attachUniform({
        data: size,
        name: 'u_Size',
        type: '1f',
      });
      this.mainProgram.attachUniform({
        data: speed,
        name: 'u_Speed',
        type: '1f',
      });
      this.mainProgram.attachUniform({
        data: Date.now() - this.startTime,
        name: 'u_Time',
        type: '1f',
      });
      const group = `stars-${index}`;
      this.gl.context.drawArrays(
        this.gl.context.POINTS,
        this.memory.offsets.positions[group] / 8,
        this.memory.positions[group].length
      );
    }
  }

  animate() {
    const doAnimate = () => {
      this.render();
      window.requestAnimationFrame(doAnimate);
    };
    doAnimate();
  }

  subscribeEvents() {
    window.addEventListener('resize', this._onResize);
  }

  unsubscribeEvents() {
    window.removeEventListener('resize', this._onResize);
  }

  onResize() {
    this.calcSize();
    this.gl.setupCanvas(this.width, this.height, this.gl.canvas);
    this.mainProgram.attachUniform({
      data: this.resolution,
      name: 'u_Res',
      type: '2fv',
    });
    this.gl.context.viewport(0, 0, this.width, this.height);
  }
}

export default Logo;
