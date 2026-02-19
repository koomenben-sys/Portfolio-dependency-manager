import { useLocalStorage } from './useLocalStorage';
import { generateRefCode } from '../utils/referenceCodeGenerator';

export function useInitiatives(counters, setCounters) {
  const [initiatives, setInitiatives] = useLocalStorage('initiatives', []);

  const addInitiative = (team) => {
    const refCode = generateRefCode('initiative', counters.initiative);
    const newInitiative = {
      id: Date.now(),
      refCode,
      name: '',
      team,
      quarters: [],
      portfolio: '',
      effort: 'M',
      valueType: 'EUR',
      valueAmount: '',
      priority: initiatives.length + 1
    };
    
    setInitiatives([...initiatives, newInitiative]);
    setCounters({ ...counters, initiative: counters.initiative + 1 });
  };

  const updateInitiative = (id, field, value) => {
    setInitiatives(initiatives.map(i => 
      i.id === id ? { ...i, [field]: value } : i
    ));
  };

  const deleteInitiative = (id) => {
    setInitiatives(initiatives.filter(i => i.id !== id));
  };

  const toggleQuarter = (id, quarter) => {
    setInitiatives(initiatives.map(i => 
      i.id === id 
        ? {
            ...i,
            quarters: i.quarters.includes(quarter)
              ? i.quarters.filter(q => q !== quarter)
              : [...i.quarters, quarter]
          }
        : i
    ));
  };

  const reorderInitiatives = (newOrder) => {
    setInitiatives(newOrder);
  };

  return {
    initiatives,
    addInitiative,
    updateInitiative,
    deleteInitiative,
    toggleQuarter,
    reorderInitiatives
  };
}
