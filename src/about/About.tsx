import { useRef } from 'react'
import strudelLogo from './strudel.svg?url'
import './About.css'

declare const __LICENSE_BUILD__: {
  revision: string
  local: boolean
  noticesUrl: string
  sourceUrl: string
}
const build = __LICENSE_BUILD__
const repository = 'https://github.com/FireLakeLabs/monkeyboys-modular-synth'

export function About() {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <nav className="about-links" aria-label="About and source">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-controls="about-dialog"
          onClick={() => dialog.current?.showModal()}
        >
          About
        </button>
        <a
          className="about-icon"
          href={repository}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
        >
          <svg aria-hidden="true" fill="currentColor" width="18" height="18" viewBox="0 0 16 16">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
        </a>
        <a
          className="about-icon"
          href="https://strudel.cc"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Strudel"
          title="Strudel"
        >
          <img src={strudelLogo} alt="" width="18" height="18" />
        </a>
      </nav>
      <dialog
        id="about-dialog"
        className="about-dialog"
        ref={dialog}
        aria-labelledby="about-title"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
      >
        <h2 id="about-title">About MonkeyBoy’s Modular Synth</h2>
        <p>A modular rack and live Strudel code: two views of the same patch.</p>
        <p>
          Made by{' '}
          <a href="https://firelakelabs.com" target="_blank" rel="noopener noreferrer">
            Fire Lake Labs
          </a>
          . Copyright © 2026 Aaron Hoyt.
        </p>
        <p>
          Our original source code is MIT licensed. This app includes Strudel, Superdough,
          Kabelsalat and other open source software. The combined software application is
          distributed under{' '}
          <a href={build.noticesUrl} target="_blank" rel="noopener noreferrer">
            AGPL-3.0-or-later
          </a>{' '}
          terms. You may use, share and modify it under those terms. It comes with no warranty.
        </p>
        <div className="about-source">
          <a
            href={`${repository}/tree/${build.revision}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source for this version
          </a>
          <small>
            {build.local ? 'Local development checkout based on' : 'Commit'}{' '}
            <code>{build.revision}</code>
          </small>
          <a href={build.sourceUrl} download>
            Download source and build instructions
          </a>
          <a href={build.noticesUrl} target="_blank" rel="noopener noreferrer">
            Full license texts and third-party notices
          </a>
        </div>
        <details>
          <summary>Engine sources and local changes</summary>
          <p>
            This app modifies Strudel and Superdough for audio cleanup, routing and BYTEBEAT error
            reporting. The download includes the dated changes, patch scripts, installed runtime
            packages and pinned upstream source archives.
          </p>
          <ul>
            <li>
              <a
                href="https://codeberg.org/uzu/strudel/src/commit/d198910a86fcaecd658ef528bfa6d7884e93490b"
                target="_blank"
                rel="noopener noreferrer"
              >
                Strudel core, mini, tonal, transpiler and draw 1.2.6
              </a>
            </li>
            <li>
              <a
                href="https://codeberg.org/uzu/strudel/src/commit/f610965f4332837febe45743105da170e8b331ed"
                target="_blank"
                rel="noopener noreferrer"
              >
                Strudel web, webaudio and Superdough 1.3.0; Supradough 1.2.4
              </a>
            </li>
            <li>
              <a
                href="https://codeberg.org/froos/kabelsalat/src/commit/3c9f953bbe72a3d46cf58d053bdad28b2d9ed1d5"
                target="_blank"
                rel="noopener noreferrer"
              >
                Kabelsalat core 0.4.0; lib and web 0.4.1
              </a>
            </li>
          </ul>
        </details>
        <details>
          <summary>Music, samples and artwork</summary>
          <p>
            Library patches keep their individual credits. Third-party compositions, transcriptions,
            recordings, fonts and logos retain their separate rights. Software licenses do not grant
            rights to all music or samples.
          </p>
          <p>
            Redistribution permissions for the supplied trance transcription, underlying War Pigs
            material and some external samples remain unverified. The full notices record their
            sources and known permission status.
          </p>
        </details>
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
      </dialog>
    </>
  )
}
