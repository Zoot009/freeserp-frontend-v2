"use client"

import { useRef, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function VideoSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !textRef.current || !videoRef.current || !featuresRef.current) return

    const ctx = gsap.context(() => {
      // Text slides in from left
      gsap.from(textRef.current, {
        x: -80,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: textRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      })

      // Video slides in from right
      gsap.from(videoRef.current, {
        x: 80,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: videoRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      })

      // Features slide up from bottom
      const featureItems = featuresRef.current?.querySelectorAll(".feature-item")
      featureItems?.forEach((item, index) => {
        gsap.from(item, {
          y: 60,
          opacity: 0,
          duration: 0.8,
          delay: index * 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: featuresRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative w-full py-24 px-12 md:px-16 lg:px-24 xl:px-32">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
      
      <div className="w-full max-w-7xl mx-auto relative z-10 space-y-24">
        {/* Top Section: Title + Video */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 lg:gap-20 xl:gap-24 items-center">
          {/* Left side - Title and description */}
          <div ref={textRef} className="lg:col-span-2 space-y-6 px-6 md:px-8">
            <h2 className="font-display text-5xl md:text-6xl lg:text-7xl uppercase tracking-tight">
              Watch <br/> Free SERP in <span className="text-accent">Action</span>
            </h2>
            <p className="font-sans text-lg md:text-xl text-muted-foreground leading-relaxed">
              See how easy it is to track your website rankings with FreeSERP. 
              Our intuitive dashboard gives you real-time insights into your SEO performance.
            </p>
          </div>

          {/* Right side - Video */}
          <div ref={videoRef} className="lg:col-span-3 flex justify-end px-6 md:px-8">
            <video
              className="w-full h-auto rounded-lg border border-border"
              controls
              controlsList="nodownload"
              playsInline
              preload="metadata"
              poster="/thumbnail.png"
            >
              <source src="/demo-video.mp4" type="video/mp4" />
              <source src="/demo-video.webm" type="video/webm" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>

        {/* Bottom Section: Features in 3 columns */}
        <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 px-6 md:px-8">
          <div className="feature-item flex flex-col items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-bold">1</span>
            </div>
            <div>
              <h3 className="font-sans font-semibold text-lg mb-2">Real-time Rank Tracking</h3>
              <p className="font-sans text-sm text-muted-foreground">Monitor your keyword positions as they change</p>
            </div>
          </div>

          <div className="feature-item flex flex-col items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-bold">2</span>
            </div>
            <div>
              <h3 className="font-sans font-semibold text-lg mb-2">Automated Checks</h3>
              <p className="font-sans text-sm text-muted-foreground">Schedule checks at 1h, 6h, 12h, or 24h intervals</p>
            </div>
          </div>

          <div className="feature-item flex flex-col items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-bold">3</span>
            </div>
            <div>
              <h3 className="font-sans font-semibold text-lg mb-2">Instant Notifications</h3>
              <p className="font-sans text-sm text-muted-foreground">Get email alerts when your rankings change</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
