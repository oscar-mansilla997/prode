import goat from './assets/cabra.svg'

export default function Brand({ size = 34 }: { size?: number }) {
  return (
    <span className="brandmark">
      <img src={goat} alt="" style={{ height: size }} />
      <span className="brandtext"><small>LA</small><b>CABRA</b></span>
    </span>
  )
}
