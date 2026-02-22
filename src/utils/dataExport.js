export function exportData(portfolios, initiatives, dependencies) {
  const data = {
    portfolios,
    initiatives,
    dependencies,
    exportDate: new Date().toISOString()
  };
  
  return JSON.stringify(data, null, 2);
}

export function importData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    return {
      success: true,
      data: {
        portfolios: data.portfolios || [],
        initiatives: data.initiatives || [],
        dependencies: data.dependencies || [],
        teams: data.teams || []
      }
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON format'
    };
  }
}
