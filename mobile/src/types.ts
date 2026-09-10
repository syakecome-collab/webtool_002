/** 1 回の稼働記録。端末内にだけ保存する。 */
export type Shift = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  service: string;
  /** 0:00 からの分数 */
  startMinutes: number;
  endMinutes: number;
  breakMinutes: number;
  deliveries: number;
  /** 配達報酬（円） */
  earnings: number;
  tips: number;
  /** ガソリン・駐車場・通信費など（円） */
  expenses: number;
  distanceKm: number;
  weather: Weather;
  memo: string;
};

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow';

export const WEATHERS: { key: Weather; label: string; icon: string }[] = [
  { key: 'sunny', label: '晴れ', icon: '☀️' },
  { key: 'cloudy', label: '曇り', icon: '☁️' },
  { key: 'rain', label: '雨', icon: '🌧' },
  { key: 'snow', label: '雪', icon: '❄️' },
];

export const SERVICES = ['Uber Eats', '出前館', 'Wolt', 'menu', '軽貨物', 'その他'];

export type Settings = {
  /** 月の目標額（円）。0 なら未設定 */
  monthlyGoal: number;
  /** 1km あたりのガソリン代の目安（円）。距離から経費を概算するのに使う */
  fuelCostPerKm: number;
  defaultService: string;
};

export const DEFAULT_SETTINGS: Settings = {
  monthlyGoal: 0,
  fuelCostPerKm: 0,
  defaultService: 'Uber Eats',
};
