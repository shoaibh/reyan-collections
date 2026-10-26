const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const formatINR = (rupees: number): string => `₹${inr.format(rupees)}`
