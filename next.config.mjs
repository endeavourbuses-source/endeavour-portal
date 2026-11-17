/** @type {import('next').NextConfig} */
export default { serverExternalPackages: ['postgres', 'bcryptjs'], experimental: { serverActions: { bodySizeLimit: '5mb' } } };
