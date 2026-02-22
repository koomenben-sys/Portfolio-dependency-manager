import { useLocalStorage } from './useLocalStorage';
import { generateRefCode } from '../utils/referenceCodeGenerator';

export function useDependencies(counters, setCounters, initiatives) {
  const [dependencies, setDependencies] = useLocalStorage('dependencies', []);

  const addDependency = (initiativeId) => {
    const refCode = generateRefCode('dependency', counters.dependency);
    const newDependency = {
      id: Date.now(),
      refCode,
      initiativeId,
      dependsOnTeam: '',
      description: '',
      quarters: [],
      effort: 'TBD',
      status: 'Pending'
    };
    
    setDependencies([...dependencies, newDependency]);
    setCounters({ ...counters, dependency: counters.dependency + 1 });
  };

  const updateDependency = (id, field, value) => {
    setDependencies(dependencies.map(d => 
      d.id === id ? { ...d, [field]: value } : d
    ));
  };

  const deleteDependency = (id) => {
    setDependencies(dependencies.filter(d => d.id !== id));
  };

  const toggleDependencyQuarter = (id, quarter) => {
    setDependencies(dependencies.map(d => 
      d.id === id 
        ? {
            ...d,
            quarters: (d.quarters || []).includes(quarter)
              ? (d.quarters || []).filter(q => q !== quarter)
              : [...(d.quarters || []), quarter]
          }
        : d
    ));
  };

  const updateDependencyStatus = (id, status) => {
    setDependencies(dependencies.map(d => 
      d.id === id ? { ...d, status } : d
    ));
  };

  const deleteDependenciesForInitiative = (initiativeId) => {
    setDependencies(dependencies.filter(d => d.initiativeId !== initiativeId));
  };

  return {
    dependencies,
    setDependencies,
    addDependency,
    updateDependency,
    deleteDependency,
    toggleDependencyQuarter,
    updateDependencyStatus,
    deleteDependenciesForInitiative
  };
}
