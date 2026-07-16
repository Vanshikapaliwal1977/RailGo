import fs from 'fs';
import path from 'path';

// Define DB directory
const DB_DIR = path.join(process.cwd(), 'data');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Interface definitions matching MongoDB collection structures
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'admin';
  verified: boolean;
  savedPassengers: SavedPassenger[];
  favoriteRoutes: FavoriteRoute[];
  createdAt: string;
}

export interface SavedPassenger {
  name: string;
  age: number;
  gender: string;
  berthPreference: 'Lower' | 'Middle' | 'Upper' | 'Side Lower' | 'Side Upper' | 'No Preference';
  seniorCitizen: boolean;
}

export interface FavoriteRoute {
  source: string;
  destination: string;
}

export interface Station {
  code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface Train {
  id: string;
  trainNumber: string;
  trainName: string;
  source: string; // station code
  destination: string; // station code
  intermediateStations: string[]; // station codes
  arrivalTimes: Record<string, string>; // stationCode -> "HH:MM"
  departureTimes: Record<string, string>; // stationCode -> "HH:MM"
  distance: number; // km
  classesAvailable: string[]; // ['1A', '2A', '3A', 'SL']
  seatCapacity: Record<string, number>; // class -> max seats
  fareByClass: Record<string, number>; // class -> base fare in INR
  runningDays: string[]; // ['Mon', 'Tue', ...]
  status: 'Active' | 'Cancelled' | 'Delayed';
  delayMinutes?: number;
}

export interface Passenger {
  name: string;
  age: number;
  gender: string;
  berthPreference: string;
  seniorCitizen: boolean;
  assignedSeat?: {
    coach: string;
    seatNumber: number;
    berthType: string;
  };
}

export interface Booking {
  bookingId: string;
  userId: string;
  trainId: string;
  trainNumber: string;
  trainName: string;
  source: string;
  destination: string;
  passengers: Passenger[];
  classType: string;
  quota: string; // 'General' | 'Ladies' | 'Tatkal' | 'Senior Citizen'
  fare: number;
  status: 'Confirmed' | 'RAC' | 'WL' | 'Cancelled';
  bookingDate: string;
  journeyDate: string;
  paymentId: string;
  transactionStatus: 'Success' | 'Refunded' | 'Failed';
}

export interface PaymentLog {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  type: 'Payment' | 'Refund';
  status: 'Success' | 'Failed';
  timestamp: string;
}

// Low-profile JSON File database helper
class FileDatabase {
  private getPath(collection: string) {
    return path.join(DB_DIR, `${collection}.json`);
  }

  read<T>(collection: string, defaultData: T[] = []): T[] {
    const file = this.getPath(collection);
    if (!fs.existsSync(file)) {
      this.write(collection, defaultData);
      return defaultData;
    }
    try {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error(`Error reading collection ${collection}`, e);
      return defaultData;
    }
  }

  write<T>(collection: string, data: T[]): void {
    const file = this.getPath(collection);
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`Error writing collection ${collection}`, e);
    }
  }
}

const fileDb = new FileDatabase();

export interface JourneyInventory {
  id: string; // `${trainId}_${journeyDate}_${classType}`
  trainId: string;
  journeyDate: string; // 'YYYY-MM-DD'
  classType: string; // '1A', '2A', '3A', 'SL'
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  racCapacity: number;
  racBooked: number;
  wlCapacity: number;
  wlBooked: number;
}

// Main DB Accessors
export const DB = {
  getUsers: () => fileDb.read<User>('users'),
  saveUsers: (data: User[]) => fileDb.write<User>('users', data),
  
  getStations: () => fileDb.read<Station>('stations'),
  saveStations: (data: Station[]) => fileDb.write<Station>('stations', data),
  
  getTrains: () => fileDb.read<Train>('trains'),
  saveTrains: (data: Train[]) => fileDb.write<Train>('trains', data),
  
  getBookings: () => fileDb.read<Booking>('bookings'),
  saveBookings: (data: Booking[]) => fileDb.write<Booking>('bookings', data),
  
  getPayments: () => fileDb.read<PaymentLog>('payments'),
  savePayments: (data: PaymentLog[]) => fileDb.write<PaymentLog>('payments', data),

  getInventory: () => fileDb.read<JourneyInventory>('inventory'),
  saveInventory: (data: JourneyInventory[]) => fileDb.write<JourneyInventory>('inventory', data)
};

// ================= MONGO DB EMULATION DRIVER =================
export class ObjectId {
  private id: string;
  constructor(id?: string) {
    this.id = id || `obj_${Math.random().toString(36).substring(2, 11)}`;
  }
  toString() {
    return this.id;
  }
}

class MongoCursor<T> {
  constructor(private items: T[]) {}
  
  async toArray(): Promise<T[]> {
    return this.items;
  }

  async limit(n: number): Promise<MongoCursor<T>> {
    return new MongoCursor(this.items.slice(0, n));
  }
}

class MongoCollection<T> {
  constructor(private collectionName: string) {}

  async find(query: any = {}): Promise<MongoCursor<T>> {
    let data = fileDb.read<T>(this.collectionName);
    
    // basic mock filtering
    if (query && Object.keys(query).length > 0) {
      data = data.filter((item: any) => {
        for (const key in query) {
          const val = query[key];
          
          if (typeof val === 'object' && val !== null) {
            if ('$regex' in val) {
              const regex = new RegExp(val.$regex, val.$options || 'i');
              if (!regex.test(String(item[key]))) return false;
            } else if ('$in' in val) {
              if (!val.$in.includes(item[key])) return false;
            } else if ('$eq' in val) {
              if (item[key] !== val.$eq) return false;
            } else if ('$ne' in val) {
              if (item[key] === val.$ne) return false;
            }
          } else {
            // handle dot notation like "passengers.assignedSeat" or similar if queried
            if (key.includes('.')) {
              const parts = key.split('.');
              let deepVal = item;
              for (const part of parts) {
                deepVal = deepVal ? deepVal[part] : undefined;
              }
              if (deepVal !== val) return false;
            } else if (item[key] !== val) {
              return false;
            }
          }
        }
        return true;
      });
    }
    
    return new MongoCursor(data);
  }

  async findOne(query: any = {}): Promise<T | null> {
    const cursor = await this.find(query);
    const arr = await cursor.toArray();
    return arr[0] || null;
  }

  async insertOne(doc: any): Promise<{ insertedId: string; acknowledged: boolean }> {
    const data = fileDb.read<any>(this.collectionName);
    const newDoc = { ...doc };
    if (!newDoc._id) {
      newDoc._id = new ObjectId().toString();
    }
    data.push(newDoc);
    fileDb.write(this.collectionName, data);
    return { insertedId: newDoc._id, acknowledged: true };
  }

  async insertMany(docs: any[]): Promise<{ insertedCount: number; acknowledged: boolean }> {
    const data = fileDb.read<any>(this.collectionName);
    const savedDocs = docs.map(d => {
      const copy = { ...d };
      if (!copy._id) copy._id = new ObjectId().toString();
      return copy;
    });
    data.push(...savedDocs);
    fileDb.write(this.collectionName, data);
    return { insertedCount: savedDocs.length, acknowledged: true };
  }

  async updateOne(query: any, update: any, options?: { upsert?: boolean }): Promise<{ modifiedCount: number; upsertedCount: number }> {
    const data = fileDb.read<any>(this.collectionName);
    let modifiedCount = 0;
    
    const idx = data.findIndex((item: any) => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });

    if (idx !== -1) {
      const item = data[idx];
      if (update.$set) {
        Object.assign(item, update.$set);
      }
      if (update.$inc) {
        for (const key in update.$inc) {
          item[key] = (item[key] || 0) + update.$inc[key];
        }
      }
      data[idx] = item;
      fileDb.write(this.collectionName, data);
      modifiedCount = 1;
      return { modifiedCount, upsertedCount: 0 };
    } else if (options && options.upsert) {
      const newDoc = { ...query };
      if (update.$set) {
        Object.assign(newDoc, update.$set);
      }
      newDoc._id = new ObjectId().toString();
      data.push(newDoc);
      fileDb.write(this.collectionName, data);
      return { modifiedCount: 0, upsertedCount: 1 };
    }

    return { modifiedCount: 0, upsertedCount: 0 };
  }

  async deleteOne(query: any): Promise<{ deletedCount: number }> {
    const data = fileDb.read<any>(this.collectionName);
    const idx = data.findIndex((item: any) => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
    if (idx !== -1) {
      data.splice(idx, 1);
      fileDb.write(this.collectionName, data);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async countDocuments(query: any = {}): Promise<number> {
    const cursor = await this.find(query);
    const arr = await cursor.toArray();
    return arr.length;
  }
}

export class MongoClient {
  constructor(private uri: string) {}
  async connect(): Promise<this> {
    return this;
  }
  db(name?: string) {
    return {
      collection: (collectionName: string) => {
        return new MongoCollection(collectionName);
      }
    };
  }
}

// Seed Constants
const STATIC_STATIONS: Station[] = [
  { code: "NDLS", name: "New Delhi", city: "Delhi", state: "Delhi", latitude: 28.643, longitude: 77.222 },
  { code: "MMCT", name: "Mumbai Central", city: "Mumbai", state: "Maharashtra", latitude: 18.969, longitude: 72.815 },
  { code: "HWH", name: "Howrah Junction", city: "Kolkata", state: "West Bengal", latitude: 22.583, longitude: 88.341 },
  { code: "MAS", name: "MGR Chennai Central", city: "Chennai", state: "Tamil Nadu", latitude: 13.082, longitude: 80.275 },
  { code: "SBC", name: "KSR Bengaluru City", city: "Bengaluru", state: "Karnataka", latitude: 12.978, longitude: 77.569 },
  { code: "BPL", name: "Bhopal Junction", city: "Bhopal", state: "Madhya Pradesh", latitude: 23.259, longitude: 77.412 },
  { code: "PUNE", name: "Pune Junction", city: "Pune", state: "Maharashtra", latitude: 18.528, longitude: 73.874 },
  { code: "JP", name: "Jaipur Junction", city: "Jaipur", state: "Rajasthan", latitude: 26.920, longitude: 75.787 },
  { code: "PNBE", name: "Patna Junction", city: "Patna", state: "Bihar", latitude: 25.602, longitude: 85.137 },
  { code: "LKO", name: "Lucknow Charbagh NR", city: "Lucknow", state: "Uttar Pradesh", latitude: 26.832, longitude: 80.922 },
  { code: "SC", name: "Secunderabad Junction", city: "Hyderabad", state: "Telangana", latitude: 17.432, longitude: 78.503 },
  { code: "ADI", name: "Ahmedabad Junction", city: "Ahmedabad", state: "Gujarat", latitude: 23.027, longitude: 72.601 },
  { code: "GHY", name: "Guwahati Junction", city: "Guwahati", state: "Assam", latitude: 26.181, longitude: 91.752 },
  { code: "ERS", name: "Ernakulam Junction", city: "Kochi", state: "Kerala", latitude: 9.967, longitude: 76.289 },
  { code: "AGC", name: "Agra Cantt", city: "Agra", state: "Uttar Pradesh", latitude: 27.158, longitude: 77.994 },
  { code: "ASR", name: "Amritsar Junction", city: "Amritsar", state: "Punjab", latitude: 31.634, longitude: 74.872 },
  { code: "BSB", name: "Varanasi Junction", city: "Varanasi", state: "Uttar Pradesh", latitude: 25.326, longitude: 82.987 },
  { code: "CDG", name: "Chandigarh Junction", city: "Chandigarh", state: "Chandigarh", latitude: 30.706, longitude: 76.822 },
  { code: "DDN", name: "Dehradun", city: "Dehradun", state: "Uttarakhand", latitude: 30.315, longitude: 78.040 },
  { code: "JAT", name: "Jammu Tawi", city: "Jammu", state: "Jammu and Kashmir", latitude: 32.705, longitude: 74.879 },
  { code: "NGP", name: "Nagpur Junction", city: "Nagpur", state: "Maharashtra", latitude: 21.152, longitude: 79.088 },
  { code: "CBE", name: "Coimbatore Junction", city: "Coimbatore", state: "Tamil Nadu", latitude: 10.997, longitude: 76.961 },
  { code: "MDU", name: "Madurai Junction", city: "Madurai", state: "Tamil Nadu", latitude: 9.917, longitude: 78.111 },
  { code: "VSKP", name: "Visakhapatnam Junction", city: "Visakhapatnam", state: "Andhra Pradesh", latitude: 17.729, longitude: 83.298 },
  { code: "HYB", name: "Hyderabad Deccan", city: "Hyderabad", state: "Telangana", latitude: 17.391, longitude: 78.468 },
  { code: "CNB", name: "Kanpur Central", city: "Kanpur", state: "Uttar Pradesh", latitude: 26.454, longitude: 80.351 },
  { code: "ALD", name: "Prayagraj Junction", city: "Prayagraj", state: "Uttar Pradesh", latitude: 25.449, longitude: 81.829 },
  { code: "GWL", name: "Gwalior Junction", city: "Gwalior", state: "Madhya Pradesh", latitude: 26.216, longitude: 78.188 },
  { code: "JBP", name: "Jabalpur Junction", city: "Jabalpur", state: "Madhya Pradesh", latitude: 23.161, longitude: 79.949 },
  { code: "SUR", name: "Solapur Junction", city: "Solapur", state: "Maharashtra", latitude: 17.659, longitude: 75.906 },
  { code: "RK", name: "Roorkee", city: "Roorkee", state: "Uttarakhand", latitude: 29.865, longitude: 77.887 },
  { code: "HW", name: "Haridwar", city: "Haridwar", state: "Uttarakhand", latitude: 29.945, longitude: 78.164 },
  { code: "BUI", name: "Ballia", city: "Ballia", state: "Uttar Pradesh", latitude: 25.760, longitude: 84.149 },
  { code: "MGS", name: "Pt. Deen Dayal Upadhyaya", city: "Mughalsarai", state: "Uttar Pradesh", latitude: 25.276, longitude: 83.114 },
  { code: "KGP", name: "Kharagpur Junction", city: "Kharagpur", state: "West Bengal", latitude: 22.327, longitude: 87.329 },
  { code: "DGP", name: "Durgapur", city: "Durgapur", state: "West Bengal", latitude: 23.497, longitude: 87.316 },
  { code: "ASN", name: "Asansol Junction", city: "Asansol", state: "West Bengal", latitude: 23.684, longitude: 86.974 },
  { code: "RNC", name: "Ranchi Junction", city: "Ranchi", state: "Jharkhand", latitude: 23.344, longitude: 85.326 },
  { code: "TATA", name: "Tatanagar Junction", city: "Jamshedpur", state: "Jharkhand", latitude: 22.769, longitude: 86.203 },
  { code: "DHN", name: "Dhanbad Junction", city: "Dhanbad", state: "Jharkhand", latitude: 23.791, longitude: 86.429 },
  { code: "BBS", name: "Bhubaneswar", city: "Bhubaneswar", state: "Odisha", latitude: 20.264, longitude: 85.843 },
  { code: "CTC", name: "Cuttack Junction", city: "Cuttack", state: "Odisha", latitude: 20.473, longitude: 85.894 },
  { code: "PURI", name: "Puri", city: "Puri", state: "Odisha", latitude: 19.814, longitude: 85.823 },
  { code: "R", name: "Raipur Junction", city: "Raipur", state: "Chhattisgarh", latitude: 21.258, longitude: 81.630 },
  { code: "BSP", name: "Bilaspur Junction", city: "Bilaspur", state: "Chhattisgarh", latitude: 22.091, longitude: 82.141 },
  { code: "NGP_C", name: "Nagpur Central", city: "Nagpur", state: "Maharashtra", latitude: 21.145, longitude: 79.088 },
  { code: "BD", name: "Badnera Junction", city: "Amravati", state: "Maharashtra", latitude: 20.871, longitude: 77.747 },
  { code: "AK", name: "Akola Junction", city: "Akola", state: "Maharashtra", latitude: 20.707, longitude: 77.012 },
  { code: "BSL", name: "Bhusaval Junction", city: "Bhusaval", state: "Maharashtra", latitude: 21.047, longitude: 75.792 },
  { code: "JL", name: "Jalgaon Junction", city: "Jalgaon", state: "Maharashtra", latitude: 21.007, longitude: 75.562 },
  { code: "NK", name: "Nashik Road", city: "Nashik", state: "Maharashtra", latitude: 19.963, longitude: 73.834 },
  { code: "KYN", name: "Kalyan Junction", city: "Kalyan", state: "Maharashtra", latitude: 19.235, longitude: 73.129 },
  { code: "TNA", name: "Thane", city: "Thane", state: "Maharashtra", latitude: 19.186, longitude: 72.973 },
  { code: "DR", name: "Dadar", city: "Mumbai", state: "Maharashtra", latitude: 19.017, longitude: 72.843 },
  { code: "ST", name: "Surat", city: "Surat", state: "Gujarat", latitude: 21.205, longitude: 72.841 },
  { code: "BRC", name: "Vadodara Junction", city: "Vadodara", state: "Gujarat", latitude: 22.311, longitude: 73.181 },
  { code: "ANND", name: "Anand Junction", city: "Anand", state: "Gujarat", latitude: 22.562, longitude: 72.966 },
  { code: "RJT", name: "Rajkot Junction", city: "Rajkot", state: "Gujarat", latitude: 22.311, longitude: 70.802 },
  { code: "HAPA", name: "Hapa", city: "Jamnagar", state: "Gujarat", latitude: 22.458, longitude: 70.103 },
  { code: "OKHA", name: "Okha", city: "Okha", state: "Gujarat", latitude: 22.464, longitude: 69.071 },
  { code: "UJN", name: "Ujjain Junction", city: "Ujjain", state: "Madhya Pradesh", latitude: 23.183, longitude: 75.778 },
  { code: "INDB", name: "Indore Junction", city: "Indore", state: "Madhya Pradesh", latitude: 22.717, longitude: 75.868 },
  { code: "MTJ", name: "Mathura Junction", city: "Mathura", state: "Uttar Pradesh", latitude: 27.489, longitude: 77.674 },
  { code: "NZM", name: "Hazrat Nizamuddin", city: "Delhi", state: "Delhi", latitude: 28.588, longitude: 77.253 },
  { code: "KOTA", name: "Kota Junction", city: "Kota", state: "Rajasthan", latitude: 25.219, longitude: 75.864 },
  { code: "RTM", name: "Ratlam Junction", city: "Ratlam", state: "Madhya Pradesh", latitude: 23.336, longitude: 75.042 },
  { code: "AII", name: "Ajmer Junction", city: "Ajmer", state: "Rajasthan", latitude: 26.452, longitude: 74.632 },
  { code: "UDZ", name: "Udaipur City", city: "Udaipur", state: "Rajasthan", latitude: 24.572, longitude: 73.697 },
  { code: "JU", name: "Jodhpur Junction", city: "Jodhpur", state: "Rajasthan", latitude: 26.289, longitude: 73.018 },
  { code: "BKN", name: "Bikaner Junction", city: "Bikaner", state: "Rajasthan", latitude: 28.016, longitude: 73.313 },
  { code: "LDH", name: "Ludhiana Junction", city: "Ludhiana", state: "Punjab", latitude: 30.902, longitude: 75.861 },
  { code: "JUC", name: "Jalandhar City", city: "Jalandhar", state: "Punjab", latitude: 31.322, longitude: 75.578 },
  { code: "KLK", name: "Kalka", city: "Kalka", state: "Haryana", latitude: 30.835, longitude: 76.935 },
  { code: "YOL", name: "Yol", city: "Dharamshala", state: "Himachal Pradesh", latitude: 32.172, longitude: 76.368 },
  { code: "GKP", name: "Gorakhpur Junction", city: "Gorakhpur", state: "Uttar Pradesh", latitude: 26.759, longitude: 83.373 },
  { code: "GD", name: "Gonda Junction", city: "Gonda", state: "Uttar Pradesh", latitude: 27.139, longitude: 81.961 },
  { code: "BST", name: "Basti", city: "Basti", state: "Uttar Pradesh", latitude: 26.801, longitude: 82.721 },
  { code: "DEOS", name: "Deoria Sadar", city: "Deoria", state: "Uttar Pradesh", latitude: 26.502, longitude: 83.778 },
  { code: "SV", name: "Siwan Junction", city: "Siwan", state: "Bihar", latitude: 26.216, longitude: 84.364 },
  { code: "CPR", name: "Chhapra Junction", city: "Chhapra", state: "Bihar", latitude: 25.779, longitude: 84.731 },
  { code: "HJP", name: "Hajipur Junction", city: "Hajipur", state: "Bihar", latitude: 25.688, longitude: 85.221 },
  { code: "MFP", name: "Muzaffarpur Junction", city: "Muzaffarpur", state: "Bihar", latitude: 26.119, longitude: 85.397 },
  { code: "SPJ", name: "Samastipur Junction", city: "Samastipur", state: "Bihar", latitude: 25.861, longitude: 85.787 },
  { code: "DBG", name: "Darbhanga Junction", city: "Darbhanga", state: "Bihar", latitude: 26.152, longitude: 85.897 },
  { code: "JYG", name: "Jaynagar", city: "Jaynagar", state: "Bihar", latitude: 26.583, longitude: 86.133 },
  { code: "MBI", name: "Madhubani", city: "Madhubani", state: "Bihar", latitude: 26.362, longitude: 86.079 },
  { code: "SHC", name: "Saharsa Junction", city: "Saharsa", state: "Bihar", latitude: 25.881, longitude: 86.602 },
  { code: "KIR", name: "Katihar Junction", city: "Katihar", state: "Bihar", latitude: 25.549, longitude: 87.561 },
  { code: "NJP", name: "New Jalpaiguri", city: "Siliguri", state: "West Bengal", latitude: 26.683, longitude: 88.441 },
  { code: "APDJ", name: "Alipurduar Junction", city: "Alipurduar", state: "West Bengal", latitude: 26.491, longitude: 89.529 },
  { code: "NCB", name: "New Cooch Behar", city: "Cooch Behar", state: "West Bengal", latitude: 26.331, longitude: 89.475 },
  { code: "NBQ", name: "New Bongaigaon", city: "Bongaigaon", state: "Assam", latitude: 26.495, longitude: 90.528 },
  { code: "GLPT", name: "Goalpara Town", city: "Goalpara", state: "Assam", latitude: 26.166, longitude: 90.645 },
  { code: "KYQ", name: "Kamakhya Junction", city: "Guwahati", state: "Assam", latitude: 26.155, longitude: 91.696 },
  { code: "DBRG", name: "Dibrugarh", city: "Dibrugarh", state: "Assam", latitude: 27.469, longitude: 94.912 },
  { code: "TSK", name: "Tinsukia Junction", city: "Tinsukia", state: "Assam", latitude: 27.491, longitude: 95.341 },
  { code: "MXN", name: "Mariani Junction", city: "Mariani", state: "Assam", latitude: 26.662, longitude: 94.324 },
  { code: "FKG", name: "Furkating Junction", city: "Golaghat", state: "Assam", latitude: 26.478, longitude: 93.978 },
  { code: "LMG", name: "Lumding Junction", city: "Lumding", state: "Assam", latitude: 25.753, longitude: 93.181 },
  { code: "HJI", name: "Hojai", city: "Hojai", state: "Assam", latitude: 26.002, longitude: 92.861 }
];

// Seed Stations if empty or missing some
const stationsList = DB.getStations();
if (stationsList.length < 100) {
  // Let's combine static stations and generate additional until we reach exactly 100 stations
  const combined = [...STATIC_STATIONS];
  const states = ["Uttar Pradesh", "Maharashtra", "Tamil Nadu", "Karnataka", "West Bengal", "Gujarat", "Rajasthan", "Madhya Pradesh", "Bihar", "Andhra Pradesh", "Kerala", "Odisha", "Punjab", "Haryana"];
  const codesUsed = new Set(STATIC_STATIONS.map(s => s.code));
  
  let i = 1;
  while (combined.length < 100) {
    const code = `ST${String(i).padStart(3, '0')}`;
    if (!codesUsed.has(code)) {
      const state = states[combined.length % states.length];
      combined.push({
        code,
        name: `${state} Road Station ${i}`,
        city: `${state} City ${i}`,
        state: state,
        latitude: 10 + (combined.length * 0.17) % 25,
        longitude: 70 + (combined.length * 0.23) % 20
      });
      codesUsed.add(code);
    }
    i++;
  }
  DB.saveStations(combined);
}

// Seed Trains (Exactly 50 Trains of various types)
const trainsList = DB.getTrains();
if (trainsList.length < 50) {
  const currentStations = DB.getStations();
  const getStationCode = (idx: number) => currentStations[idx % currentStations.length].code;
  
  const generatedTrains: Train[] = [];
  
  // Custom high-quality, recognizable premium trains first
  const templates = [
    { num: "22436", name: "Vande Bharat Express", src: "NDLS", dest: "BSB", inter: ["AGC", "CNB", "ALD"], days: ["Mon", "Tue", "Wed", "Fri", "Sat", "Sun"], dist: 755 },
    { num: "12002", name: "New Delhi Shatabdi Express", src: "NDLS", dest: "BPL", inter: ["MTJ", "AGC", "GWL", "JBP"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 705 },
    { num: "12001", name: "New Delhi Shatabdi Express Return", src: "BPL", dest: "NDLS", inter: ["JBP", "GWL", "AGC", "MTJ"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 705 },
    { num: "12952", name: "Mumbai Rajdhani Express", src: "NDLS", dest: "MMCT", inter: ["KOTA", "RTM", "BRC", "ST"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 1386 },
    { num: "12951", name: "Mumbai Rajdhani Express Return", src: "MMCT", dest: "NDLS", inter: ["ST", "BRC", "RTM", "KOTA"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 1386 },
    { num: "12127", name: "Mumbai Pune Intercity Express", src: "MMCT", dest: "PUNE", inter: ["TNA", "KYN"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 192 },
    { num: "12128", name: "Pune Mumbai Intercity Express", src: "PUNE", dest: "MMCT", inter: ["KYN", "TNA"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 192 },
    { num: "12915", name: "Ashram Express", src: "JP", dest: "ADI", inter: ["AII", "UJN"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 490 },
    { num: "12916", name: "Ashram Express Return", src: "ADI", dest: "JP", inter: ["UJN", "AII"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 490 },
    { num: "12639", name: "Brindavan Express", src: "MAS", dest: "SBC", inter: ["CBE"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 360 },
    { num: "12640", name: "Brindavan Express Return", src: "SBC", dest: "MAS", inter: ["CBE"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 360 },
    { num: "12771", name: "Secunderabad Nagpur Express", src: "SC", dest: "NGP", inter: ["HYB"], days: ["Mon", "Wed", "Fri", "Sat", "Sun"], dist: 575 },
    { num: "12772", name: "Nagpur Secunderabad Express", src: "NGP", dest: "SC", inter: ["HYB"], days: ["Tue", "Thu", "Sat", "Sun"], dist: 575 },
    { num: "12301", name: "Howrah Rajdhani Express", src: "HWH", dest: "NDLS", inter: ["ASN", "DHN", "MGS", "CNB"], days: ["Mon", "Tue", "Thu", "Fri", "Sat", "Sun"], dist: 1450 },
    { num: "12626", name: "Kerala Express", src: "NDLS", dest: "ERS", inter: ["AGC", "GWL", "BPL", "NGP", "SC", "MAS", "CBE"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 3036 },
    { num: "12213", name: "Duronto Express", src: "SBC", dest: "NZM", inter: ["SC", "NGP", "BPL", "GWL"], days: ["Sat"], dist: 2360 },
    { num: "12181", name: "Dayodaya Express", src: "JBP", dest: "JP", inter: ["BPL", "KOTA", "AII"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 760 },
    { num: "12907", name: "Maharashtra Sampark Kranti", src: "BD", dest: "NZM", inter: ["AK", "BSL", "JL", "NK", "KYN"], days: ["Wed", "Sun"], dist: 1350 },
    { num: "12565", name: "Bihar Sampark Kranti", src: "DBG", dest: "NDLS", inter: ["SPJ", "MFP", "HJP", "CPR", "SV", "GKP", "GD", "LKO", "CNB"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 1165 },
    { num: "12423", name: "Rajdhani Express (NJP)", src: "DBRG", dest: "NDLS", inter: ["TSK", "MXN", "LMG", "KYQ", "GHY", "NJP", "KIR", "PNBE", "MGS", "CNB"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dist: 2420 }
  ];

  // Populate actual list with premium ones first
  templates.forEach((t, index) => {
    const id = `train_${index + 1}`;
    
    // Create realistic arrival / departure timings along the route
    const arrivalTimes: Record<string, string> = {};
    const departureTimes: Record<string, string> = {};
    
    arrivalTimes[t.src] = "Source";
    departureTimes[t.src] = "06:00"; // starts early
    
    let currentHour = 6;
    let currentMinute = 0;
    
    t.inter.forEach((station, step) => {
      currentHour += 2;
      currentMinute += 15;
      if (currentMinute >= 60) {
        currentHour += 1;
        currentMinute -= 60;
      }
      const arrStr = `${String(currentHour % 24).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
      arrivalTimes[station] = arrStr;
      
      currentMinute += 5; // stays for 5 mins
      if (currentMinute >= 60) {
        currentHour += 1;
        currentMinute -= 60;
      }
      const depStr = `${String(currentHour % 24).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
      departureTimes[station] = depStr;
    });
    
    currentHour += 3;
    const destArrStr = `${String(currentHour % 24).padStart(2, '0')}:00`;
    arrivalTimes[t.dest] = destArrStr;
    departureTimes[t.dest] = "Destination";

    generatedTrains.push({
      id,
      trainNumber: t.num,
      trainName: t.name,
      source: t.src,
      destination: t.dest,
      intermediateStations: t.inter,
      arrivalTimes,
      departureTimes,
      distance: t.dist,
      classesAvailable: ["1A", "2A", "3A", "SL"],
      seatCapacity: {
        "1A": 18,
        "2A": 48,
        "3A": 64,
        "SL": 72
      },
      fareByClass: {
        "1A": Math.round(t.dist * 2.8 + 200),
        "2A": Math.round(t.dist * 1.6 + 120),
        "3A": Math.round(t.dist * 1.1 + 80),
        "SL": Math.round(t.dist * 0.35 + 40)
      },
      runningDays: t.days,
      status: "Active"
    });
  });

  // Generate standard Mail / Express trains to fill up to 50 trains
  const prefixes = ["Secunderabad", "Chennai", "Kolkata", "Bengaluru", "Ahmedabad", "Jaipur", "Lucknow", "Patna", "Guwahati", "Kochi", "Varanasi", "Amritsar", "Pune", "Indore", "Bhopal"];
  const suffixes = ["Express", "Mail", "Jan Shatabdi", "Superfast", "Passenger", "Humsafar", "Garib Rath"];
  
  for (let idx = 10; idx < 50; idx++) {
    const id = `train_${idx + 1}`;
    const prefix = prefixes[idx % prefixes.length];
    const suffix = suffixes[idx % suffixes.length];
    
    const srcIndex = (idx * 3) % currentStations.length;
    let destIndex = (idx * 5 + 7) % currentStations.length;
    if (srcIndex === destIndex) {
      destIndex = (destIndex + 1) % currentStations.length;
    }
    
    const src = currentStations[srcIndex].code;
    const dest = currentStations[destIndex].code;
    
    // Choose 3 intermediate station indexes
    const inter1 = currentStations[(srcIndex + 1) % currentStations.length].code;
    const inter2 = currentStations[(srcIndex + 2) % currentStations.length].code;
    const inter3 = currentStations[(destIndex - 1 + currentStations.length) % currentStations.length].code;
    const inter = [inter1, inter2, inter3].filter(code => code !== src && code !== dest);
    
    const trainNumber = String(10000 + idx * 179 + 3);
    const trainName = `${prefix} ${currentStations[destIndex].city} ${suffix}`;
    
    const distance = 400 + (idx * 55) % 1500;
    
    // Arrival/departure
    const arrivalTimes: Record<string, string> = {};
    const departureTimes: Record<string, string> = {};
    
    const startHour = 5 + (idx * 3) % 18;
    arrivalTimes[src] = "Source";
    departureTimes[src] = `${String(startHour).padStart(2, '0')}:30`;
    
    let currentHour = startHour;
    inter.forEach((st, sIdx) => {
      currentHour = (currentHour + 2) % 24;
      arrivalTimes[st] = `${String(currentHour).padStart(2, '0')}:15`;
      departureTimes[st] = `${String(currentHour).padStart(2, '0')}:20`;
    });
    
    currentHour = (currentHour + 3) % 24;
    arrivalTimes[dest] = `${String(currentHour).padStart(2, '0')}:45`;
    departureTimes[dest] = "Destination";

    const isGaribRath = suffix === "Garib Rath";
    const classes = isGaribRath ? ["3A"] : ["2A", "3A", "SL"];

    const baseFareFactor = isGaribRath ? 0.75 : 1.0;
    const fareByClass: Record<string, number> = {};
    if (classes.includes("1A")) fareByClass["1A"] = Math.round(distance * 2.5 + 180);
    if (classes.includes("2A")) fareByClass["2A"] = Math.round(distance * 1.4 * baseFareFactor + 100);
    if (classes.includes("3A")) fareByClass["3A"] = Math.round(distance * 0.95 * baseFareFactor + 70);
    if (classes.includes("SL")) fareByClass["SL"] = Math.round(distance * 0.3 * baseFareFactor + 30);

    const seatCapacity: Record<string, number> = {};
    classes.forEach(c => {
      seatCapacity[c] = c === "SL" ? 72 : c === "3A" ? 64 : c === "2A" ? 48 : 18;
    });

    const runDays = ["Mon", "Wed", "Fri"];
    if (idx % 2 === 0) runDays.push("Tue", "Thu", "Sat", "Sun");

    generatedTrains.push({
      id,
      trainNumber,
      trainName,
      source: src,
      destination: dest,
      intermediateStations: inter,
      arrivalTimes,
      departureTimes,
      distance,
      classesAvailable: classes,
      seatCapacity,
      fareByClass,
      runningDays: runDays,
      status: idx % 15 === 0 ? "Delayed" : "Active",
      delayMinutes: idx % 15 === 0 ? 35 : undefined
    });
  }

  DB.saveTrains(generatedTrains);
}

// Seed admin user and sample users
const usersList = DB.getUsers();
if (usersList.length === 0) {
  // Let's seed default admin and user
  const adminUser: User = {
    id: "user_admin",
    email: "admin@railconnect.ai",
    // Bcrypt simulator: we will just match or use simple hash (hash code = original password in lowercase for reliability)
    passwordHash: "admin123", // For this fullstack mock let's support plain matching or simple hash
    name: "System Admin",
    phone: "9876543210",
    role: "admin",
    verified: true,
    savedPassengers: [],
    favoriteRoutes: [],
    createdAt: new Date().toISOString()
  };

  const sampleUser: User = {
    id: "user_sample",
    email: "paliwalvanshika49@gmail.com",
    passwordHash: "user123",
    name: "Vanshika Paliwal",
    phone: "9123456789",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    role: "user",
    verified: true,
    savedPassengers: [
      { name: "Suresh Paliwal", age: 62, gender: "Male", berthPreference: "Lower", seniorCitizen: true },
      { name: "Anita Paliwal", age: 58, gender: "Female", berthPreference: "Lower", seniorCitizen: false }
    ],
    favoriteRoutes: [
      { source: "NDLS", destination: "BPL" },
      { source: "NDLS", destination: "MMCT" }
    ],
    createdAt: new Date().toISOString()
  };

  DB.saveUsers([adminUser, sampleUser]);
}

// Booking seeds for historical charts
const bookingsList = DB.getBookings();
if (bookingsList.length === 0) {
  const trains = DB.getTrains();
  const sampleBookings: Booking[] = [
    {
      bookingId: "PNR8472948271",
      userId: "user_sample",
      trainId: trains[0].id,
      trainNumber: trains[0].trainNumber,
      trainName: trains[0].trainName,
      source: "NDLS",
      destination: "BSB",
      passengers: [
        {
          name: "Vanshika Paliwal",
          age: 23,
          gender: "Female",
          berthPreference: "No Preference",
          seniorCitizen: false,
          assignedSeat: { coach: "C1", seatNumber: 14, berthType: "Window" }
        },
        {
          name: "Suresh Paliwal",
          age: 62,
          gender: "Male",
          berthPreference: "Lower",
          seniorCitizen: true,
          assignedSeat: { coach: "C1", seatNumber: 1, berthType: "Lower" }
        }
      ],
      classType: "3A",
      quota: "General",
      fare: trains[0].fareByClass["3A"] * 2,
      status: "Confirmed",
      bookingDate: "2026-07-10T10:30:00Z",
      journeyDate: "2026-07-20",
      paymentId: "PAY_MOCK_8819284",
      transactionStatus: "Success"
    }
  ];
  DB.saveBookings(sampleBookings);
}

// Seat allocation service with Berth Allocation & RAC/WL promotion logic
export class SeatAllocationService {
  static allocateSeats(trainId: string, journeyDate: string, classType: string, passengers: Passenger[], quota: string): {
    status: 'Confirmed' | 'RAC' | 'WL';
    passengers: Passenger[];
  } {
    const train = DB.getTrains().find(t => t.id === trainId);
    if (!train) {
      throw new Error("Train not found");
    }

    const allBookings = DB.getBookings().filter(b => b.trainId === trainId && b.journeyDate === journeyDate && b.classType === classType && b.status !== 'Cancelled');
    
    // Count already booked seats
    let confirmedCount = 0;
    let racCount = 0;
    let wlCount = 0;

    allBookings.forEach(b => {
      if (b.status === 'Confirmed') {
        b.passengers.forEach(p => { if (p.assignedSeat) confirmedCount++; });
      } else if (b.status === 'RAC') {
        racCount += b.passengers.length;
      } else if (b.status === 'WL') {
        wlCount += b.passengers.length;
      }
    });

    const maxCapacity = train.seatCapacity[classType] || 60;
    const maxRAC = 10; // Max RAC seats
    const maxWL = 15; // Max WL seats

    const totalNewPassengers = passengers.length;
    
    // Determine overall booking status based on current fills
    let finalStatus: 'Confirmed' | 'RAC' | 'WL' = 'Confirmed';
    
    if (confirmedCount + totalNewPassengers <= maxCapacity) {
      finalStatus = 'Confirmed';
    } else if (confirmedCount + racCount + totalNewPassengers <= maxCapacity + maxRAC) {
      finalStatus = 'RAC';
    } else {
      finalStatus = 'WL';
    }

    // Allocate seat details for each passenger
    const updatedPassengers = passengers.map((passenger, idx) => {
      const updated = { ...passenger };
      
      if (finalStatus === 'Confirmed') {
        const seatNo = confirmedCount + idx + 1;
        const coachPrefix = classType === '1A' ? 'H' : classType === '2A' ? 'A' : classType === '3A' ? 'B' : 'S';
        const coachNo = Math.ceil(seatNo / 60); // Say 60 seats per coach
        const seatIndexInCoach = ((seatNo - 1) % 60) + 1;
        
        // Berth Type mapping (1 to 8 cycle)
        // 1, 4 = Lower, 2, 5 = Middle, 3, 6 = Upper, 7 = Side Lower, 8 = Side Upper
        const seatCycle = seatIndexInCoach % 8;
        let berthType = "Upper";
        if (seatCycle === 1 || seatCycle === 4) berthType = "Lower";
        else if (seatCycle === 2 || seatCycle === 5) berthType = "Middle";
        else if (seatCycle === 7) berthType = "Side Lower";
        else if (seatCycle === 0) berthType = "Side Upper"; // 8 % 8 is 0

        // Handle preference/senior priority
        if (passenger.seniorCitizen || passenger.berthPreference === 'Lower') {
          // Priority Lower berth simulation: say we just give them Lower berth label directly if possible
          berthType = "Lower";
        }

        updated.assignedSeat = {
          coach: `${coachPrefix}${coachNo}`,
          seatNumber: seatIndexInCoach,
          berthType
        };
      } else if (finalStatus === 'RAC') {
        const racNo = racCount + idx + 1;
        updated.assignedSeat = {
          coach: `RAC1`,
          seatNumber: racNo,
          berthType: "Side Lower (Shared)"
        };
      } else {
        // WL has no seat numbers yet, only WL number
        const wlNo = wlCount + idx + 1;
        updated.assignedSeat = {
          coach: "WL",
          seatNumber: wlNo,
          berthType: "Waiting List"
        };
      }

      return updated;
    });

    return {
      status: finalStatus,
      passengers: updatedPassengers
    };
  }

  // Promote passengers on cancellation (RAC -> Confirmed, WL -> RAC -> Confirmed)
  static handlePromotionOnCancellation(trainId: string, journeyDate: string, classType: string) {
    const bookings = DB.getBookings().filter(b => b.trainId === trainId && b.journeyDate === journeyDate && b.classType === classType);
    const confirmedBookings = bookings.filter(b => b.status === 'Confirmed');
    const racBookings = bookings.filter(b => b.status === 'RAC');
    const wlBookings = bookings.filter(b => b.status === 'WL');

    if (racBookings.length === 0 && wlBookings.length === 0) return;

    const train = DB.getTrains().find(t => t.id === trainId);
    if (!train) return;

    const maxCapacity = train.seatCapacity[classType] || 60;
    
    // Recalculate confirmed bookings headcount
    let currentConfirmedCount = confirmedBookings.reduce((acc, b) => acc + b.passengers.length, 0);

    // Promote RAC to Confirmed if space available
    const allBookingsList = DB.getBookings();

    racBookings.forEach(booking => {
      if (currentConfirmedCount + booking.passengers.length <= maxCapacity) {
        // Promote booking to Confirmed
        const index = allBookingsList.findIndex(b => b.bookingId === booking.bookingId);
        if (index !== -1) {
          allBookingsList[index].status = 'Confirmed';
          allBookingsList[index].passengers = allBookingsList[index].passengers.map((p, pIdx) => {
            const seatNo = currentConfirmedCount + pIdx + 1;
            const coachPrefix = classType === '1A' ? 'H' : classType === '2A' ? 'A' : classType === '3A' ? 'B' : 'S';
            return {
              ...p,
              assignedSeat: {
                coach: `${coachPrefix}1`,
                seatNumber: seatNo,
                berthType: seatNo % 8 === 1 || seatNo % 8 === 4 ? "Lower" : "Upper"
              }
            };
          });
          currentConfirmedCount += booking.passengers.length;
        }
      }
    });

    // Save updated list
    DB.saveBookings(allBookingsList);
  }
}
