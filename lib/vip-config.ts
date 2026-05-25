export const DEFAULT_VIP_PLANS = [
  { level: 0, name: "Free",     price: 0,    bonus: "1%",  color: "bg-slate-500" },
  { level: 1, name: "Bronze",   price: 50,   bonus: "5%",  color: "bg-amber-700" },
  { level: 2, name: "Silver",   price: 150,  bonus: "10%", color: "bg-gray-400"  },
  { level: 3, name: "Gold",     price: 500,  bonus: "20%", color: "bg-yellow-500"},
  { level: 4, name: "Platinum", price: 1000, bonus: "35%", color: "bg-cyan-400"  },
  { level: 5, name: "Diamond",  price: 2000, bonus: "50%", color: "bg-purple-500"},
];

export type VipPlan = typeof DEFAULT_VIP_PLANS[number];
