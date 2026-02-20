import { useLocalStorage } from './useLocalStorage';
import { generateRefCode } from '../utils/referenceCodeGenerator';

export function usePortfolios() {
  const [portfolios, setPortfolios] = useLocalStorage('portfolios', []);
  const [counters, setCounters] = useLocalStorage('counters', {
    portfolio: 0,
    initiative: 0,
    dependency: 0
  });

  const addPortfolio = () => {
    const refCode = generateRefCode('portfolio', counters.portfolio);
    const newPortfolio = {
      id: Date.now(),
      refCode,
      name: '',
      description: '',
      year: new Date().getFullYear(),
      owner: ''
    };
    
    setPortfolios([...portfolios, newPortfolio]);
    setCounters({ ...counters, portfolio: counters.portfolio + 1 });
  };

  const updatePortfolio = (id, field, value) => {
    setPortfolios(portfolios.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const deletePortfolio = (id) => {
    setPortfolios(portfolios.filter(p => p.id !== id));
  };

  return {
    portfolios,
    setPortfolios,
    addPortfolio,
    updatePortfolio,
    deletePortfolio,
    counters,
    setCounters
  };
}
