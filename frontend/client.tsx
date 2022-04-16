import ReactDOM from 'react-dom'
import { AppWrapper } from './app-wrapper'

const root = document.getElementById('root')!

console.log(process.env.NODE_ENV)
ReactDOM.render(<AppWrapper />, root)
