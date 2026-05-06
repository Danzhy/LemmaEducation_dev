import { ImageResponse } from 'next/og'

export const size = {
  width: 32,
  height: 32,
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F2F5F4',
          borderRadius: '8px',
          color: '#16423C',
          fontSize: 18,
          fontStyle: 'italic',
          fontWeight: 600,
        }}
      >
        L
      </div>
    ),
    size
  )
}
