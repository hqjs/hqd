import gifcicle from 'imagemin-gifsicle';
import imagemin from 'imagemin';
import mozjpeg from 'imagemin-mozjpeg';
import pngquant from 'imagemin-pngquant';
import svgo from 'imagemin-svgo';

const TRESHOLD = 1024; // 1Kb

/* eslint-disable no-magic-numbers */
export default async (ctx, content) => {
  if (ctx.size < TRESHOLD) return content;
  const plugins = [];
  switch (ctx.stats.ext) {
    case '.gif': {
      plugins.push(gifcicle());
      break;
    }
    case '.jpg':
    case '.jpeg': {
      plugins.push(mozjpeg({ quality: 85 }));
      break;
    }
    case '.png': {
      plugins.push(pngquant({ quality: [ 0.5, 0.85 ] }));
      break;
    }
    case '.svg': {
      plugins.push(svgo({
        plugins: [
          { removeViewBox: false },
        ],
      }));
      break;
    }
  }
  const buffer = await imagemin.buffer(content, { plugins });
  return buffer;
};
/* eslint-enable no-magic-numbers */
