/**
 * Copyright © 2018 hqjs
 */

const rect = Float32Array.of(
  1, 1,
  1, -1,
  -1, -1,
  -1, 1
);

export default class GL {
  static loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = err => reject(err);
      image.src = src;
    });
  }

  static get rect() {
    return rect;
  }

  constructor({width, height, selector, options}) {
    this.setupCanvas(width, height, selector);
    this.setupGLContext(options);
    this.extensions = {};
    this.textures = {};
    this.framebuffers = {};
    this.buffers = {};
    this.programs = {};
    this.vshaders = {};
    this.fshaders = {};
  }

  setupCanvas(width, height, selector) {
    const element = selector instanceof HTMLElement ?
      selector :
      document.querySelector(selector);
    if(!element) {
      this.canvas = document.createElement('canvas');
      document.body.appendChild(this.canvas);
    } else {
      if(element instanceof HTMLCanvasElement) {
        this.canvas = element;
      } else {
        this.canvas = document.createElement('canvas');
        element.appendChild(this.canvas);
      }
    }
    this.width = width;
    this.height = height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  setupGLContext(options = {}, preffered = 'webgl') {
    this.context = this.canvas.getContext(preffered, options) ||
      this.canvas.getContext('webgl2', options) ||
      this.canvas.getContext('experimental-webgl2', options) ||
      this.canvas.getContext('webgl', options) ||
      this.canvas.getContext('experimental-webgl', options);
  }

  enableAlpha({
    sfactor = this.context.SRC_ALPHA,
    dfactor = this.context.ONE_MINUS_SRC_ALPHA
  } = {}) {
    this.context.blendFunc(sfactor, dfactor);
    this.context.enable(this.context.BLEND);
  }

  enableExtension(extname) {
    const ext = this.context.getExtension(extname);
    if(!ext) {
      throw new Error(`Extension ${extname} is not supported on this system`);
    }
    this.extensions[extname] = ext;
    return ext;
  }

  createVertexShader(id, src) {
    this.vshaders[id] = new VertexShader(this.context, src);
  }

  deleteVertexShader(id) {
    this.vshaders[id].delete();
    this.vshaders[id] = undefined;
  }

  createFragmentShader(id, src) {
    this.fshaders[id] = new FragmentShader(this.context, src);
  }

  deleteFragmnetShader(id) {
    this.vshaders[id].delete();
    this.fshaders[id] = undefined;
  }

  createProgram(id, vid, fid) {
    return this.programs[id] = new Program(this.context, this.vshaders[vid], this.fshaders[fid]);
  }

  useProgram(id) {
    this.programs[id].use();
    return this.programs[id];
  }

  deleteProgram(id) {
    this.programs[id].delete();
    this.programs[id] = undefined;
  }

  createBuffer(id, data, {
    btype = this.context.ARRAY_BUFFER,
    dtype = this.context.STATIC_DRAW
  } = {}) {
    this.buffers[id] = new BufferGL(this.context, data, {btype, dtype});
    return this.buffers[id];
  }

  useBuffer(id, btype) {
    this.buffers[id].use(btype);
    return this.buffers[id];
  }

  updateBuffer(id, data, offset, btype) {
    this.buffers[id].update(data, offset, btype);
  }

  deleteBuffer(id) {
    this.buffers[id].delete();
    this.buffers[id] = undefined;
  }

  createFrameBuffer(id, texture, {
    attachment = this.context.COLOR_ATTACHMENT0,
    ttarget = this.context.TEXTURE_2D
  } = {}) {
    this.framebuffers[id] = new FrameBufferGL(this.context, texture, {attachment, ttarget});
    return this.framebuffers[id];
  }

  useFrameBuffer(id) {
    this.framebuffers[id].use();
    return this.framebuffers[id];
  }

  releaseFrameBuffer() {
    this.context.bindFramebuffer(this.context.FRAMEBUFFER, null);
  }

  deleteFrameBuffer(id) {
    this.framebuffers[id].delete();
    this.framebuffers[id] = undefined;
  }

  createTexture(id, data, {
    ttype = this.context.TEXTURE_2D,
    itype = this.context.UNSIGNED_BYTE,
    format = this.context.RGBA,
    iformat = this.context.RGBA,
    lod = 0,
    minfilter = this.context.NEAREST,
    magfilter = this.context.NEAREST,
    wraps = this.context.CLAMP_TO_EDGE,
    wrapt = this.context.CLAMP_TO_EDGE,
    mipmap = false,
    flip = true,
    multa = false
  } = {}) {
    this.textures[id] = new Texture(this.context, data, {
      ttype,
      itype,
      format,
      iformat,
      lod,
      minfilter,
      magfilter,
      wraps,
      wrapt,
      mipmap,
      flip,
      multa
    });
    return this.textures[id];
  }

  useTexture(id) {
    this.textures[id].use();
    return this.textures[id];
  }

  activateTexture(id, slot) {
    this.textures[id].activate(slot);
    return this.textures[id];
  }

  deleteTexture(id) {
    this.textures[id].delete();
    this.textures[id] = undefined;
  }
}

class BufferGL {
  constructor(context, data, {
    btype = this.context.ARRAY_BUFFER,
    dtype = this.context.STATIC_DRAW
  } = {}) {
    this.context = context;
    this.btype = btype;
    this.dtype = dtype;
    this.buffer = this.context.createBuffer();
    if(!this.buffer) {
      this.delete();
      throw new Error('Failed to create vertex buffer object');
    }
    this.use();
    this.context.bufferData(btype, data, dtype);
  }

  delete() {
    this.context.deleteBuffer(this.buffer);
  }

  use(btype = this.btype) {
    this.context.bindBuffer(btype, this.buffer);
  }

  update(data, offset = 0, btype = this.btype) {
    this.context.bufferSubData(btype, offset, data);
  }
}

class FrameBufferGL {
  constructor(context, texture, {
    attachment = this.context.COLOR_ATTACHMENT0,
    ttarget = this.context.TEXTURE_2D
  } = {}) {
    this.context = context;
    this.framebuffer = this.context.createFramebuffer();
    if(!this.framebuffer) {
      this.delete();
      throw new Error('Failed to create frame buffer object');
    }
    this.use();
    this.context.framebufferTexture2D(this.context.FRAMEBUFFER, attachment, ttarget, texture.texture, texture.lod);
  }

  delete() {
    this.context.deleteFramebuffer(this.framebuffer);
  }

  use() {
    this.context.bindFramebuffer(this.context.FRAMEBUFFER, this.framebuffer);
  }

  release() {
    this.context.bindFramebuffer(this.context.FRAMEBUFFER, null);
  }

  update(data, offset = 0, btype = this.btype) {
    this.context.bufferSubData(btype, offset, data);
  }
}

class Texture {
  constructor(context, data, {
    ttype = this.context.TEXTURE_2D,
    itype = this.context.UNSIGNED_BYTE,
    format = this.context.RGBA,
    iformat = this.context.RGBA,
    lod = 0,
    minfilter = this.context.NEAREST,
    magfilter = this.context.NEAREST,
    wraps = this.context.CLAMP_TO_EDGE,
    wrapt = this.context.CLAMP_TO_EDGE,
    mipmap = false,
    flip = true,
    multa = false
  } = {}) {
    this.context = context;
    this.ttype = ttype;
    this.itype = itype;
    this.format = format;
    this.iformat = iformat;
    this.lod = lod;
    this.minfilter = minfilter;
    this.magfilter = magfilter;
    this.wraps = wraps;
    this.wrapt = wrapt;
    this.mipmap = mipmap;
    this.flip = flip;
    this.multa = multa;
    this.create(data);
  }

  create(data) {
    this.texture = this.context.createTexture();
    if(!this.texture) {
      this.delete();
      throw new Error('Failed to create texture object');
    }
    this.use();
    this.context.pixelStorei(this.context.UNPACK_FLIP_Y_WEBGL, this.flip);
    this.context.pixelStorei(this.context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.multa);
    this.context.texParameteri(this.ttype, this.context.TEXTURE_WRAP_S, this.wraps);
    this.context.texParameteri(this.ttype, this.context.TEXTURE_WRAP_T, this.wrapt);
    this.context.texParameteri(this.ttype, this.context.TEXTURE_MIN_FILTER, this.minfilter);
    this.context.texParameteri(this.ttype, this.context.TEXTURE_MAG_FILTER, this.magfilter);
    if(data.data === null || ArrayBuffer.isView(data.data)) {
      this.context.texImage2D(
        this.ttype,
        this.lod,
        this.iformat,
        data.width,
        data.height,
        0,
        this.format,
        this.itype,
        data.data
      );
    } else {
      this.context.texImage2D(this.ttype, this.lod, this.iformat, this.format, this.itype, data);
    }
    if(this.mipmap) this.context.generateMipmap(this.ttype);
  }

  delete() {
    this.context.deleteTexture(this.texture);
  }

  use() {
    this.context.bindTexture(this.ttype, this.texture);
  }

  activate(slot) {
    this.context.activeTexture(this.context[`TEXTURE${slot}`]);
  }
}

class Program {
  constructor(context, vshader, fshader) {
    this.context = context;
    this.vshader = vshader;
    this.fshader = fshader;
    this.create();
  }

  create() {
    this.program = this.context.createProgram();
    this.context.attachShader(this.program, this.vshader.shader);
    this.context.attachShader(this.program, this.fshader.shader);
    this.context.linkProgram(this.program);
    if(!this.context.getProgramParameter(this.program, this.context.LINK_STATUS)) {
      this.delete();
      throw new Error('Unable to initialize the shader program.');
    }
  }

  delete() {
    this.context.deleteProgram(this.program);
  }

  use() {
    this.context.useProgram(this.program);
  }

  getAttribLocation(name) {
    const attribute = this.context.getAttribLocation(this.program, name);
    this.context.enableVertexAttribArray(attribute);
    if(attribute < 0) {
      throw new Error(`Failed to get the storage location of attribute ${name}`);
    }
    return attribute;
  }

  attachAttributes(attributes, {
    type = this.context.FLOAT,
    normalized = false
  } = {}) {
    for(const [name, {
      size = 2,
      stride = 0,
      offset = 0
    }] of Object.entries(attributes)) {
      const attribute = this.getAttribLocation(name);
      this.context.vertexAttribPointer(attribute, size, type, normalized, stride, offset);
      this.context.enableVertexAttribArray(attribute);
    }
  }

  attachAttribute({
    data,
    name,
    atype = 'array',
    size = 2,
    type = this.context.FLOAT,
    normalized = false,
    stride = 0,
    offset = 0
  }) {
    const attribute = this.getAttribLocation(name);
    switch(atype) {
      case 'array':
        this.context.vertexAttribPointer(attribute, size, type, normalized, stride, offset);
        this.context.enableVertexAttribArray(attribute);
        break;
      case '1fv':
      case '2fv':
      case '3fv':
      case '4fv':
        this.context[`vertexAttrib${atype}`](attribute, data);
        break;
      default:
        data = Array.isArray(data) ? data : [data];
        this.context[`vertexAttrib${atype}`](attribute, ...data);
        break;
    }
  }

  getUniformLocation(name) {
    const uniform = this.context.getUniformLocation(this.program, name);
    if(!uniform) {
      throw new Error(`Failed to get location of uniform ${name}`);
    }
    return uniform;
  }

  attachUniform({
    data,
    name,
    slot,
    type = 'sampler2D'
  } = {}) {
    const uniform = this.getUniformLocation(name);
    switch(type) {
      case 'sampler2D':
        this.context.uniform1i(uniform, slot);
        // this.context.uniform1iv(sampler2DUniformLoc, [v]);           // для sampler2D или массива sampler2D
        // this.context.uniform1i (samplerCubeUniformLoc,   v);         // для samplerCube (текстуры)
        // this.context.uniform1iv(samplerCubeUniformLoc, [v]);         // для samplerCube или массива samplerCube
        break;
      case 'Matrix2fv':
      case 'Matrix3fv':
      case 'Matrix4fv':
        this.context[`uniform${type}`](uniform, false, data);
        break;
      case '1fv':
      case '2fv':
      case '3fv':
      case '4fv':
        this.context[`uniform${type}`](uniform, data);
        break;
      default:
        data = Array.isArray(data) ? data : [data];
        this.context[`uniform${type}`](uniform, ...data);
        break;
    }
  }
}

class Shader {
  constructor(context, src, type = context.FRAGMENT_SHADER) {
    this.context = context;
    this.type = type;
    this.compile(src);
  }

  compile(src) {
    this.shader = this.context.createShader(this.type);
    this.context.shaderSource(this.shader, src);
    this.context.compileShader(this.shader);
    if(!this.context.getShaderParameter(this.shader, this.context.COMPILE_STATUS)) {
      const info = this.context.getShaderInfoLog(this.shader);
      this.delete();
      throw new Error(`An error occurred compiling the shaders: ${info}`);
    }
  }

  delete() {
    this.context.deleteShader(this.shader);
  }
}
class FragmentShader extends Shader {}
class VertexShader extends Shader {
  constructor(context, src) {
    super(context, src, context.VERTEX_SHADER);
  }
}
