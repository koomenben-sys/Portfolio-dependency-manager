import { useLocalStorage } from './useLocalStorage';
import { TEAMS } from '../constants';

export function useTeams() {
  const [teams, setTeams] = useLocalStorage('teams', TEAMS);

  const addTeam = () => {
    setTeams([...teams, 'New Team']);
  };

  const updateTeam = (index, name) => {
    setTeams(teams.map((t, i) => (i === index ? name : t)));
  };

  const deleteTeam = (index) => {
    setTeams(teams.filter((_, i) => i !== index));
  };

  return { teams, setTeams, addTeam, updateTeam, deleteTeam };
}
