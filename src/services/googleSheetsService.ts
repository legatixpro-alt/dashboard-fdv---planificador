import { VolumenData, ActivacionData } from '../types';

export const fetchVolumenData = async (force: boolean = false): Promise<VolumenData[]> => {
  try {
    const response = await fetch(`/api/data/volumen?force=${force}`);
    if (!response.ok) return [];
    const text = await response.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn("Respuesta no-JSON recibida en volumen data.");
      return [];
    }
    return JSON.parse(text);
  } catch (error: any) {
    console.warn("Error leyendo volumen data:", error?.message);
    return [];
  }
};

export const fetchActivacionData = async (force: boolean = false): Promise<any[]> => {
  try {
    const response = await fetch(`/api/data/activacion?force=${force}`);
    if (!response.ok) return [];
    const text = await response.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn("Respuesta no-JSON recibida en activacion data.");
      return [];
    }
    return JSON.parse(text);
  } catch (error: any) {
    console.warn("Error leyendo activacion data:", error?.message);
    return [];
  }
};

export const fetchMetasActivacion = async (force: boolean = false): Promise<any[]> => {
  try {
    const response = await fetch(`/api/data/metas-activacion?force=${force}`);
    if (!response.ok) return [];
    const text = await response.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn("Respuesta no-JSON recibida en metas data.");
      return [];
    }
    return JSON.parse(text);
  } catch (error: any) {
    console.warn("Error leyendo metas data:", error?.message);
    return [];
  }
};
