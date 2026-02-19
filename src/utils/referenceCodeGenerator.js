export function generateRefCode(type, counter) {
  const prefix = {
    portfolio: 'PF',
    initiative: 'IN',
    dependency: 'DEP'
  }[type] || 'XX';
  
  return `${prefix}-${String(counter + 1).padStart(4, '0')}`;
}
