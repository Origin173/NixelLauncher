import alpineWallpaper from './assets/alpine-valley.png?inline';

export function Landscape({ variant = 'valley' }: { variant?: string }) {
  if (variant === 'alpine') {
    return <img className="landscape" src={alpineWallpaper} alt="" />;
  }
  return (
    <svg
      className={`landscape landscape-${variant}`}
      viewBox="0 0 1440 820"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stopColor="#dce9e7" />
          <stop offset="1" stopColor="#f0eee1" />
        </linearGradient>
        <linearGradient id="water" x2="0" y2="1">
          <stop stopColor="#bbd4d0" />
          <stop offset="1" stopColor="#e2e8dc" />
        </linearGradient>
        <pattern id="grain" width="37" height="37" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="4" r=".65" fill="#254f42" opacity=".09" />
          <circle cx="27" cy="20" r=".5" fill="#fff" opacity=".4" />
        </pattern>
      </defs>
      <rect width="1440" height="820" fill="url(#sky)" />
      <circle cx="1050" cy="180" r="65" fill="#fff7df" opacity=".85" />
      <path
        d="M0 345h90v-32h95v-50h72v-30h72v40h70v-67h65v-39h62v-52h76v82h44v43h61v-25h77v-70h70v-37h89v45h49v60h80v-35h65v35h80v70h79v-28h89v-41h83v605H0Z"
        fill="#bed0c6"
      />
      <path
        d="M0 408h102v-24h100v-39h98v-29h76v34h92v-47h78v-36h83v47h81v29h101v-75h79v-21h63v34h85v-26h97v-59h74v34h90v37h84v-53h57v611H0Z"
        fill="#9fbbae"
      />
      <path
        d="M0 470h146v-30h135v-28h146v35h91v-25h126v-38h132v-20h106v42h141v-30h102v-49h100v43h115v450H0Z"
        fill="#85a797"
      />
      <path
        d="M520 446h208v24h-80v25H532v23h-86v26H332v30H230v30H0v216h1440V580h-240v-40h-143v-28H912v-25H820v-25H700v-16Z"
        fill="url(#water)"
      />
      <path d="M1440 399h-116v33h-124v41h-111v39h-75v44h86v34h126v30h92v25h122Z" fill="#4e7b66" />
      <path d="M1440 458h-116v34h-124v40h-110v24h10v34h126v30h92v25h122Z" fill="#426b59" />
      <path d="M0 551h92v-25h108v29h95v29h70v36h-72v29h-96v29H0Z" fill="#638774" />
      <path d="M0 620h143v30h-29v36h180v27h146v32h130v75H0Z" fill="#3c6957" />
      <path d="M1440 652h-144v-28h-119v36h-100v31H918v36H804v93h636Z" fill="#5e826d" />
      <path d="M1440 715h-165v-34h-112v35h-110v41H923v63h517Z" fill="#345d4e" />
      <g fill="#38664f">
        <path d="M1240 370h17v94h-17Z" />
        <path d="M1198 338h102v41h-102Zm18-31h66v31h-66Zm17-27h33v27h-33Z" />
        <path d="M1337 366h15v108h-15Z" />
        <path d="M1302 337h85v39h-85Zm15-32h55v32h-55Z" />
      </g>
      <g fill="#315b47">
        <path d="M163 436h12v103h-12Z" />
        <path d="M130 410h78v39h-78Zm15-29h49v29h-49Z" />
      </g>
      <g fill="#f5eee0" opacity=".42">
        <rect x="627" y="536" width="119" height="3" />
        <rect x="698" y="562" width="91" height="3" />
        <rect x="493" y="598" width="146" height="3" />
        <rect x="637" y="647" width="198" height="3" />
        <rect x="385" y="689" width="128" height="3" />
      </g>
      <rect width="1440" height="820" fill="url(#grain)" />
    </svg>
  );
}
