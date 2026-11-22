export async function loadPhoneModel(baseUrl, fetcher = fetch) {
  const response = await fetcher(new URL('phone-model.json', baseUrl));
  if (!response.ok) throw Error('The bundled phone-model manifest could not be loaded.');
  const manifest = await response.json();
  if (manifest.format !== 1 || !Number.isSafeInteger(manifest.size) || manifest.size <= 0 || manifest.size > 50000000 || !Array.isArray(manifest.parts) || manifest.parts.length < 1 || manifest.parts.length > 10) throw Error('Invalid phone-model manifest.');
  const model = new Uint8Array(manifest.size);
  let offset = 0;
  for (const part of manifest.parts) {
    if (!/^efficientdet_lite0\.part\d+\.bin$/.test(part.file) || !Number.isSafeInteger(part.size) || part.size <= 0) throw Error('Invalid bundled model part.');
    const result = await fetcher(new URL(part.file, baseUrl));
    if (!result.ok) throw Error(`Could not load bundled model part: ${part.file}`);
    const bytes = new Uint8Array(await result.arrayBuffer());
    if (bytes.length !== part.size || offset + bytes.length > model.length) throw Error('The bundled phone model has an incorrect size.');
    model.set(bytes, offset); offset += bytes.length;
  }
  if (offset !== manifest.size) throw Error('The bundled phone model is incomplete.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', model))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.sha256) throw Error('The bundled phone model failed its integrity check.');
  return model;
}
