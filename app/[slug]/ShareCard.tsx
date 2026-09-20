import React, { forwardRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

interface ShareCardProps {
  title: string
  slug: string
  date: string
  url: string
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ title, slug, date, url }, ref) => {
    return (
      <div
        ref={ref}
        // Fixed dimensions to ensure a predictable and high-quality image capture
        style={{ width: '400px', height: 'auto' }}
        className="flex flex-col bg-[#11131E] rounded-[24px] overflow-hidden font-sans shadow-2xl"
      >
        {/* Top vibrant section */}
        <div className="bg-[#6A42F4] p-8 flex flex-col items-start gap-4 text-white">
          <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
            Discussion
          </div>
          
          <h1 className="text-3xl font-black leading-tight uppercase tracking-tight break-words">
            {title}
          </h1>
          
          <div className="mt-2 text-white/70 font-mono text-sm">
            /{slug}
          </div>
          
          <div className="text-white/60 text-xs">
            {date}
          </div>
        </div>

        {/* Bottom dark section */}
        <div className="p-8 pb-10 flex gap-5 items-center">
          <div className="bg-white p-3 rounded-2xl flex-shrink-0 shadow-lg">
            <QRCodeCanvas value={url} size={100} level="M" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-[#64748b] text-[10px] font-bold tracking-widest uppercase mb-1">
              Public URL
            </p>
            <p className="text-[#cbd5e1] text-sm font-mono break-all leading-tight">
              {url.replace(/^https?:\/\//, '')}
            </p>
          </div>
        </div>
      </div>
    )
  }
)

ShareCard.displayName = 'ShareCard'
