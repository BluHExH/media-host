# Media Host

Personal media hosting for images, audio and video.

## Features

- Upload images, audio, video (max 50MB)
- View all uploaded files with previews
- Copy direct public URL
- Delete files
- Optional password protection

## Setup on Vercel

1. Deploy this project
2. Go to Vercel Dashboard → your project → Storage → Create Database → Blob
3. Connect the Blob store (it adds `BLOB_READ_WRITE_TOKEN` automatically)
4. (Optional) Add Environment Variable: `MEDIA_PASSWORD` = your secret password
5. Redeploy if needed
