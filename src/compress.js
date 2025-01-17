/*
 * compress.js
 * A module that compresses an image.
 * compress(httpRequest, httpResponse, ReadableStream);
 */
import sharp from 'sharp';
import redirect from './redirect.js';
sharp.cache(false);
sharp.concurrency(1);

//const sharpStream = () => sharp({ unlimited: true });

export default function compress(req, res, input) {
  const format = 'jpeg';

  /*
   * input.pipe => sharp (The compressor) => Send to httpResponse
   * The following headers:
   * |  Header Name  |            Description            |           Value            |
   * |---------------|-----------------------------------|----------------------------|
   * |x-original-size|Original photo size                |OriginSize                  |
   * |x-bytes-saved  |Saved bandwidth from original photo|OriginSize - Compressed Size|
   */
  input.pipe(
    sharp()
      .grayscale(req.params.grayscale)
      .toFormat(format, {
        quality: req.params.quality
      })
      .toBuffer((err, output, info) => {
        if (err || !info) {
          redirect(req, res);
          return;
        }

        res.setHeader('content-type', 'image/' + format);
        res.setHeader('content-length', info.size);
        res.setHeader('x-original-size', req.params.originSize);
        res.setHeader('x-bytes-saved', req.params.originSize - info.size);
        res.status(200);
        res.write(output);
        res.end();
      })
  );
}
