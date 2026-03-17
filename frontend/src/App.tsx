import { MathJaxContext } from 'better-react-mathjax';
import Home from '@/screens/home';
import '@/index.css';

const App = () => {
    return (
        <MathJaxContext>
            <Home />
        </MathJaxContext>
    );
};

export default App;
