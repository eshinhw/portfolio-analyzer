import axios from "axios";

export async function getStock(symbol: string) {
  const response = await axios.get(`http://localhost:8000/api/stocks/${symbol}`);

  return response.data;
}
