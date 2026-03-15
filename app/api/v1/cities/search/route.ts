import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

interface GeoNamesResult {
  geonameId: number;
  name: string;
  countryCode: string;
  countryName: string;
  adminName1: string;
  lat: string;
  lng: string;
  population: number;
}

interface CityEntry {
  geoname_id: number;
  city: string;
  region: string | null;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  population: number;
}

// Built-in city database for when GeoNames is not configured
const BUILTIN_CITIES: CityEntry[] = [
  { geoname_id: 5128581, city: 'New York', region: 'New York', country: 'United States', country_code: 'US', latitude: 40.7128, longitude: -74.006, population: 8336817 },
  { geoname_id: 5368361, city: 'Los Angeles', region: 'California', country: 'United States', country_code: 'US', latitude: 34.0522, longitude: -118.2437, population: 3979576 },
  { geoname_id: 4887398, city: 'Chicago', region: 'Illinois', country: 'United States', country_code: 'US', latitude: 41.8781, longitude: -87.6298, population: 2693976 },
  { geoname_id: 4699066, city: 'Houston', region: 'Texas', country: 'United States', country_code: 'US', latitude: 29.7604, longitude: -95.3698, population: 2320268 },
  { geoname_id: 4560349, city: 'Philadelphia', region: 'Pennsylvania', country: 'United States', country_code: 'US', latitude: 39.9526, longitude: -75.1652, population: 1603797 },
  { geoname_id: 4726206, city: 'San Antonio', region: 'Texas', country: 'United States', country_code: 'US', latitude: 29.4241, longitude: -98.4936, population: 1547253 },
  { geoname_id: 5506956, city: 'Las Vegas', region: 'Nevada', country: 'United States', country_code: 'US', latitude: 36.1699, longitude: -115.1398, population: 641903 },
  { geoname_id: 5391811, city: 'San Diego', region: 'California', country: 'United States', country_code: 'US', latitude: 32.7157, longitude: -117.1611, population: 1423851 },
  { geoname_id: 5392171, city: 'San Jose', region: 'California', country: 'United States', country_code: 'US', latitude: 37.3382, longitude: -121.8863, population: 1021795 },
  { geoname_id: 5375480, city: 'Mountain View', region: 'California', country: 'United States', country_code: 'US', latitude: 37.3861, longitude: -122.0839, population: 82376 },
  { geoname_id: 5392900, city: 'San Francisco', region: 'California', country: 'United States', country_code: 'US', latitude: 37.7749, longitude: -122.4194, population: 873965 },
  { geoname_id: 5809844, city: 'Seattle', region: 'Washington', country: 'United States', country_code: 'US', latitude: 47.6062, longitude: -122.3321, population: 737015 },
  { geoname_id: 4180439, city: 'Atlanta', region: 'Georgia', country: 'United States', country_code: 'US', latitude: 33.749, longitude: -84.388, population: 498715 },
  { geoname_id: 4164138, city: 'Miami', region: 'Florida', country: 'United States', country_code: 'US', latitude: 25.7617, longitude: -80.1918, population: 467963 },
  { geoname_id: 4671654, city: 'Austin', region: 'Texas', country: 'United States', country_code: 'US', latitude: 30.2672, longitude: -97.7431, population: 978908 },
  { geoname_id: 4684888, city: 'Dallas', region: 'Texas', country: 'United States', country_code: 'US', latitude: 32.7767, longitude: -96.797, population: 1343573 },
  { geoname_id: 5308655, city: 'Phoenix', region: 'Arizona', country: 'United States', country_code: 'US', latitude: 33.4484, longitude: -112.074, population: 1680992 },
  { geoname_id: 4509177, city: 'Columbus', region: 'Ohio', country: 'United States', country_code: 'US', latitude: 39.9612, longitude: -82.9988, population: 905748 },
  { geoname_id: 4990729, city: 'Detroit', region: 'Michigan', country: 'United States', country_code: 'US', latitude: 42.3314, longitude: -83.0458, population: 639111 },
  { geoname_id: 5746545, city: 'Portland', region: 'Oregon', country: 'United States', country_code: 'US', latitude: 45.5152, longitude: -122.6784, population: 652503 },
  { geoname_id: 4259418, city: 'Indianapolis', region: 'Indiana', country: 'United States', country_code: 'US', latitude: 39.7684, longitude: -86.1581, population: 887642 },
  { geoname_id: 5419384, city: 'Denver', region: 'Colorado', country: 'United States', country_code: 'US', latitude: 39.7392, longitude: -104.9903, population: 715522 },
  { geoname_id: 5037649, city: 'Minneapolis', region: 'Minnesota', country: 'United States', country_code: 'US', latitude: 44.9778, longitude: -93.265, population: 429954 },
  { geoname_id: 5263045, city: 'Milwaukee', region: 'Wisconsin', country: 'United States', country_code: 'US', latitude: 43.0389, longitude: -87.9065, population: 577222 },
  { geoname_id: 4174757, city: 'Tampa', region: 'Florida', country: 'United States', country_code: 'US', latitude: 27.9506, longitude: -82.4572, population: 399700 },
  { geoname_id: 4160021, city: 'Jacksonville', region: 'Florida', country: 'United States', country_code: 'US', latitude: 30.3322, longitude: -81.6557, population: 949611 },
  { geoname_id: 4544349, city: 'Oklahoma City', region: 'Oklahoma', country: 'United States', country_code: 'US', latitude: 35.4676, longitude: -97.5164, population: 681054 },
  { geoname_id: 4460243, city: 'Charlotte', region: 'North Carolina', country: 'United States', country_code: 'US', latitude: 35.2271, longitude: -80.8431, population: 874579 },
  { geoname_id: 4460243, city: 'Raleigh', region: 'North Carolina', country: 'United States', country_code: 'US', latitude: 35.7796, longitude: -78.6382, population: 467665 },
  { geoname_id: 4930956, city: 'Boston', region: 'Massachusetts', country: 'United States', country_code: 'US', latitude: 42.3601, longitude: -71.0589, population: 692600 },
  { geoname_id: 4887442, city: 'Nashville', region: 'Tennessee', country: 'United States', country_code: 'US', latitude: 36.1627, longitude: -86.7816, population: 689447 },
  { geoname_id: 5110302, city: 'Brooklyn', region: 'New York', country: 'United States', country_code: 'US', latitude: 40.6782, longitude: -73.9442, population: 2559903 },
  { geoname_id: 5391959, city: 'Sacramento', region: 'California', country: 'United States', country_code: 'US', latitude: 38.5816, longitude: -121.4944, population: 513624 },
  { geoname_id: 4140963, city: 'Washington', region: 'District of Columbia', country: 'United States', country_code: 'US', latitude: 38.9072, longitude: -77.0369, population: 689545 },
  { geoname_id: 4347778, city: 'Baltimore', region: 'Maryland', country: 'United States', country_code: 'US', latitude: 39.2904, longitude: -76.6122, population: 585708 },
  { geoname_id: 4990729, city: 'Salt Lake City', region: 'Utah', country: 'United States', country_code: 'US', latitude: 40.7608, longitude: -111.891, population: 200133 },
  { geoname_id: 4407066, city: 'St. Louis', region: 'Missouri', country: 'United States', country_code: 'US', latitude: 38.627, longitude: -90.1994, population: 301578 },
  { geoname_id: 4335045, city: 'New Orleans', region: 'Louisiana', country: 'United States', country_code: 'US', latitude: 29.9511, longitude: -90.0715, population: 383997 },
  { geoname_id: 5780993, city: 'Honolulu', region: 'Hawaii', country: 'United States', country_code: 'US', latitude: 21.3069, longitude: -157.8583, population: 371657 },
  { geoname_id: 5856195, city: 'Maui', region: 'Hawaii', country: 'United States', country_code: 'US', latitude: 20.7984, longitude: -156.3319, population: 167417 },
  // More US cities (mid-size)
  { geoname_id: 4259671, city: 'Evansville', region: 'Indiana', country: 'United States', country_code: 'US', latitude: 37.9716, longitude: -87.5711, population: 117429 },
  { geoname_id: 4254010, city: 'Fort Wayne', region: 'Indiana', country: 'United States', country_code: 'US', latitude: 41.0793, longitude: -85.1394, population: 263886 },
  { geoname_id: 4254679, city: 'Bloomington', region: 'Indiana', country: 'United States', country_code: 'US', latitude: 39.1653, longitude: -86.5264, population: 84067 },
  { geoname_id: 4508722, city: 'Cincinnati', region: 'Ohio', country: 'United States', country_code: 'US', latitude: 39.1031, longitude: -84.512, population: 309317 },
  { geoname_id: 4517009, city: 'Cleveland', region: 'Ohio', country: 'United States', country_code: 'US', latitude: 41.4995, longitude: -81.6954, population: 372624 },
  { geoname_id: 4508722, city: 'Dayton', region: 'Ohio', country: 'United States', country_code: 'US', latitude: 39.7589, longitude: -84.1916, population: 137644 },
  { geoname_id: 4299276, city: 'Louisville', region: 'Kentucky', country: 'United States', country_code: 'US', latitude: 38.2527, longitude: -85.7585, population: 633045 },
  { geoname_id: 4299670, city: 'Lexington', region: 'Kentucky', country: 'United States', country_code: 'US', latitude: 38.0406, longitude: -84.5037, population: 322570 },
  { geoname_id: 4990729, city: 'Grand Rapids', region: 'Michigan', country: 'United States', country_code: 'US', latitude: 42.9634, longitude: -85.6681, population: 198917 },
  { geoname_id: 4990729, city: 'Ann Arbor', region: 'Michigan', country: 'United States', country_code: 'US', latitude: 42.2808, longitude: -83.743, population: 123851 },
  { geoname_id: 5037649, city: 'St. Paul', region: 'Minnesota', country: 'United States', country_code: 'US', latitude: 44.9537, longitude: -93.09, population: 311527 },
  { geoname_id: 5263045, city: 'Madison', region: 'Wisconsin', country: 'United States', country_code: 'US', latitude: 43.0731, longitude: -89.4012, population: 269840 },
  { geoname_id: 4853828, city: 'Des Moines', region: 'Iowa', country: 'United States', country_code: 'US', latitude: 41.5868, longitude: -93.625, population: 214133 },
  { geoname_id: 4381982, city: 'Kansas City', region: 'Missouri', country: 'United States', country_code: 'US', latitude: 39.0997, longitude: -94.5786, population: 508090 },
  { geoname_id: 5074472, city: 'Omaha', region: 'Nebraska', country: 'United States', country_code: 'US', latitude: 41.2565, longitude: -95.9345, population: 486051 },
  { geoname_id: 5308655, city: 'Tucson', region: 'Arizona', country: 'United States', country_code: 'US', latitude: 32.2226, longitude: -110.9747, population: 542629 },
  { geoname_id: 5308655, city: 'Scottsdale', region: 'Arizona', country: 'United States', country_code: 'US', latitude: 33.4942, longitude: -111.9261, population: 241361 },
  { geoname_id: 5419384, city: 'Colorado Springs', region: 'Colorado', country: 'United States', country_code: 'US', latitude: 38.8339, longitude: -104.8214, population: 478961 },
  { geoname_id: 5419384, city: 'Boulder', region: 'Colorado', country: 'United States', country_code: 'US', latitude: 40.015, longitude: -105.2705, population: 105673 },
  { geoname_id: 5419384, city: 'Boise', region: 'Idaho', country: 'United States', country_code: 'US', latitude: 43.615, longitude: -116.2023, population: 228959 },
  { geoname_id: 5308655, city: 'Albuquerque', region: 'New Mexico', country: 'United States', country_code: 'US', latitude: 35.0844, longitude: -106.6504, population: 564559 },
  { geoname_id: 4160021, city: 'Orlando', region: 'Florida', country: 'United States', country_code: 'US', latitude: 28.5383, longitude: -81.3792, population: 307573 },
  { geoname_id: 4174715, city: 'St. Petersburg', region: 'Florida', country: 'United States', country_code: 'US', latitude: 27.7676, longitude: -82.6403, population: 258308 },
  { geoname_id: 4155966, city: 'Fort Lauderdale', region: 'Florida', country: 'United States', country_code: 'US', latitude: 26.1224, longitude: -80.1373, population: 182760 },
  { geoname_id: 4167147, city: 'Naples', region: 'Florida', country: 'United States', country_code: 'US', latitude: 26.142, longitude: -81.7948, population: 22088 },
  { geoname_id: 4174715, city: 'Sarasota', region: 'Florida', country: 'United States', country_code: 'US', latitude: 27.3364, longitude: -82.5307, population: 57738 },
  { geoname_id: 4174715, city: 'West Palm Beach', region: 'Florida', country: 'United States', country_code: 'US', latitude: 26.7153, longitude: -80.0534, population: 117415 },
  { geoname_id: 4460243, city: 'Durham', region: 'North Carolina', country: 'United States', country_code: 'US', latitude: 35.994, longitude: -78.8986, population: 283506 },
  { geoname_id: 4460243, city: 'Asheville', region: 'North Carolina', country: 'United States', country_code: 'US', latitude: 35.5951, longitude: -82.5515, population: 94067 },
  { geoname_id: 4781708, city: 'Richmond', region: 'Virginia', country: 'United States', country_code: 'US', latitude: 37.5407, longitude: -77.436, population: 226610 },
  { geoname_id: 4776222, city: 'Norfolk', region: 'Virginia', country: 'United States', country_code: 'US', latitude: 36.8508, longitude: -76.2859, population: 244076 },
  { geoname_id: 4140963, city: 'Arlington', region: 'Virginia', country: 'United States', country_code: 'US', latitude: 38.8816, longitude: -77.0909, population: 238643 },
  { geoname_id: 4180439, city: 'Savannah', region: 'Georgia', country: 'United States', country_code: 'US', latitude: 32.0809, longitude: -81.0912, population: 147780 },
  { geoname_id: 4247703, city: 'Chattanooga', region: 'Tennessee', country: 'United States', country_code: 'US', latitude: 35.0456, longitude: -85.3097, population: 181099 },
  { geoname_id: 4247703, city: 'Knoxville', region: 'Tennessee', country: 'United States', country_code: 'US', latitude: 35.9606, longitude: -83.9207, population: 190740 },
  { geoname_id: 4247703, city: 'Memphis', region: 'Tennessee', country: 'United States', country_code: 'US', latitude: 35.1495, longitude: -90.049, population: 633104 },
  { geoname_id: 4180439, city: 'Birmingham', region: 'Alabama', country: 'United States', country_code: 'US', latitude: 33.5207, longitude: -86.8025, population: 200733 },
  { geoname_id: 4335045, city: 'Baton Rouge', region: 'Louisiana', country: 'United States', country_code: 'US', latitude: 30.4515, longitude: -91.1871, population: 225128 },
  { geoname_id: 5391811, city: 'Santa Barbara', region: 'California', country: 'United States', country_code: 'US', latitude: 34.4208, longitude: -119.6982, population: 88665 },
  { geoname_id: 5391811, city: 'Irvine', region: 'California', country: 'United States', country_code: 'US', latitude: 33.6846, longitude: -117.8265, population: 307670 },
  { geoname_id: 5391811, city: 'Pasadena', region: 'California', country: 'United States', country_code: 'US', latitude: 34.1478, longitude: -118.1445, population: 138699 },
  { geoname_id: 5391811, city: 'Long Beach', region: 'California', country: 'United States', country_code: 'US', latitude: 33.77, longitude: -118.1937, population: 466742 },
  { geoname_id: 5809844, city: 'Tacoma', region: 'Washington', country: 'United States', country_code: 'US', latitude: 47.2529, longitude: -122.4443, population: 219346 },
  { geoname_id: 5809844, city: 'Spokane', region: 'Washington', country: 'United States', country_code: 'US', latitude: 47.6588, longitude: -117.426, population: 222081 },
  { geoname_id: 5746545, city: 'Eugene', region: 'Oregon', country: 'United States', country_code: 'US', latitude: 44.0521, longitude: -123.0868, population: 176654 },
  { geoname_id: 5128581, city: 'Buffalo', region: 'New York', country: 'United States', country_code: 'US', latitude: 42.8864, longitude: -78.8784, population: 278349 },
  { geoname_id: 5128581, city: 'Rochester', region: 'New York', country: 'United States', country_code: 'US', latitude: 43.1566, longitude: -77.6088, population: 211328 },
  { geoname_id: 5128581, city: 'Albany', region: 'New York', country: 'United States', country_code: 'US', latitude: 42.6526, longitude: -73.7562, population: 99224 },
  { geoname_id: 4930956, city: 'Providence', region: 'Rhode Island', country: 'United States', country_code: 'US', latitude: 41.824, longitude: -71.4128, population: 190934 },
  { geoname_id: 4835797, city: 'Hartford', region: 'Connecticut', country: 'United States', country_code: 'US', latitude: 41.7658, longitude: -72.6734, population: 121054 },
  { geoname_id: 4835797, city: 'New Haven', region: 'Connecticut', country: 'United States', country_code: 'US', latitude: 41.3083, longitude: -72.9279, population: 134023 },
  { geoname_id: 4835797, city: 'Stamford', region: 'Connecticut', country: 'United States', country_code: 'US', latitude: 41.0534, longitude: -73.5387, population: 135470 },
  { geoname_id: 5090174, city: 'Manchester', region: 'New Hampshire', country: 'United States', country_code: 'US', latitude: 42.9956, longitude: -71.4548, population: 115644 },
  { geoname_id: 5234372, city: 'Burlington', region: 'Vermont', country: 'United States', country_code: 'US', latitude: 44.4759, longitude: -73.2121, population: 44743 },
  { geoname_id: 4930956, city: 'Cambridge', region: 'Massachusetts', country: 'United States', country_code: 'US', latitude: 42.3736, longitude: -71.1097, population: 118403 },
  { geoname_id: 4930956, city: 'Worcester', region: 'Massachusetts', country: 'United States', country_code: 'US', latitude: 42.2626, longitude: -71.8023, population: 206518 },
  { geoname_id: 5206379, city: 'Pittsburgh', region: 'Pennsylvania', country: 'United States', country_code: 'US', latitude: 40.4406, longitude: -79.9959, population: 302971 },
  { geoname_id: 5560244, city: 'Reno', region: 'Nevada', country: 'United States', country_code: 'US', latitude: 39.5296, longitude: -119.8138, population: 264165 },
  { geoname_id: 5254218, city: 'Green Bay', region: 'Wisconsin', country: 'United States', country_code: 'US', latitude: 44.5133, longitude: -88.0133, population: 107395 },
  { geoname_id: 4726206, city: 'Fort Worth', region: 'Texas', country: 'United States', country_code: 'US', latitude: 32.7555, longitude: -97.3308, population: 918915 },
  { geoname_id: 4726206, city: 'El Paso', region: 'Texas', country: 'United States', country_code: 'US', latitude: 31.7619, longitude: -106.485, population: 678815 },
  // Canada
  { geoname_id: 6167865, city: 'Toronto', region: 'Ontario', country: 'Canada', country_code: 'CA', latitude: 43.6532, longitude: -79.3832, population: 2731571 },
  { geoname_id: 6077243, city: 'Montreal', region: 'Quebec', country: 'Canada', country_code: 'CA', latitude: 45.5017, longitude: -73.5673, population: 1762949 },
  { geoname_id: 5946768, city: 'Vancouver', region: 'British Columbia', country: 'Canada', country_code: 'CA', latitude: 49.2827, longitude: -123.1207, population: 631486 },
  { geoname_id: 5913490, city: 'Calgary', region: 'Alberta', country: 'Canada', country_code: 'CA', latitude: 51.0447, longitude: -114.0719, population: 1239220 },
  { geoname_id: 6094817, city: 'Ottawa', region: 'Ontario', country: 'Canada', country_code: 'CA', latitude: 45.4215, longitude: -75.6972, population: 934243 },
  // Europe
  { geoname_id: 2643743, city: 'London', region: 'England', country: 'United Kingdom', country_code: 'GB', latitude: 51.5074, longitude: -0.1278, population: 8982000 },
  { geoname_id: 2988507, city: 'Paris', region: 'Île-de-France', country: 'France', country_code: 'FR', latitude: 48.8566, longitude: 2.3522, population: 2161000 },
  { geoname_id: 3117735, city: 'Madrid', region: 'Community of Madrid', country: 'Spain', country_code: 'ES', latitude: 40.4168, longitude: -3.7038, population: 3223000 },
  { geoname_id: 3128760, city: 'Barcelona', region: 'Catalonia', country: 'Spain', country_code: 'ES', latitude: 41.3874, longitude: 2.1686, population: 1621000 },
  { geoname_id: 3169070, city: 'Rome', region: 'Lazio', country: 'Italy', country_code: 'IT', latitude: 41.9028, longitude: 12.4964, population: 2873000 },
  { geoname_id: 3176959, city: 'Florence', region: 'Tuscany', country: 'Italy', country_code: 'IT', latitude: 43.7696, longitude: 11.2558, population: 382258 },
  { geoname_id: 3164527, city: 'Venice', region: 'Veneto', country: 'Italy', country_code: 'IT', latitude: 45.4408, longitude: 12.3155, population: 261905 },
  { geoname_id: 3173435, city: 'Milan', region: 'Lombardy', country: 'Italy', country_code: 'IT', latitude: 45.4642, longitude: 9.19, population: 1352000 },
  { geoname_id: 2867714, city: 'Munich', region: 'Bavaria', country: 'Germany', country_code: 'DE', latitude: 48.1351, longitude: 11.582, population: 1472000 },
  { geoname_id: 2950159, city: 'Berlin', region: 'Berlin', country: 'Germany', country_code: 'DE', latitude: 52.52, longitude: 13.405, population: 3645000 },
  { geoname_id: 2759794, city: 'Amsterdam', region: 'North Holland', country: 'Netherlands', country_code: 'NL', latitude: 52.3676, longitude: 4.9041, population: 821752 },
  { geoname_id: 2618425, city: 'Copenhagen', region: null, country: 'Denmark', country_code: 'DK', latitude: 55.6761, longitude: 12.5683, population: 602481 },
  { geoname_id: 2673730, city: 'Stockholm', region: null, country: 'Sweden', country_code: 'SE', latitude: 59.3293, longitude: 18.0686, population: 975904 },
  { geoname_id: 3143244, city: 'Oslo', region: null, country: 'Norway', country_code: 'NO', latitude: 59.9139, longitude: 10.7522, population: 693491 },
  { geoname_id: 2761369, city: 'Vienna', region: null, country: 'Austria', country_code: 'AT', latitude: 48.2082, longitude: 16.3738, population: 1911191 },
  { geoname_id: 3067696, city: 'Prague', region: null, country: 'Czech Republic', country_code: 'CZ', latitude: 50.0755, longitude: 14.4378, population: 1309000 },
  { geoname_id: 756135, city: 'Warsaw', region: null, country: 'Poland', country_code: 'PL', latitude: 52.2297, longitude: 21.0122, population: 1793579 },
  { geoname_id: 3054643, city: 'Budapest', region: null, country: 'Hungary', country_code: 'HU', latitude: 47.4979, longitude: 19.0402, population: 1752286 },
  { geoname_id: 2800866, city: 'Brussels', region: null, country: 'Belgium', country_code: 'BE', latitude: 50.8503, longitude: 4.3517, population: 1198726 },
  { geoname_id: 2660646, city: 'Zurich', region: null, country: 'Switzerland', country_code: 'CH', latitude: 47.3769, longitude: 8.5417, population: 402762 },
  { geoname_id: 2660646, city: 'Geneva', region: null, country: 'Switzerland', country_code: 'CH', latitude: 46.2044, longitude: 6.1432, population: 201818 },
  { geoname_id: 2267057, city: 'Lisbon', region: null, country: 'Portugal', country_code: 'PT', latitude: 38.7223, longitude: -9.1393, population: 504718 },
  { geoname_id: 264371, city: 'Athens', region: null, country: 'Greece', country_code: 'GR', latitude: 37.9838, longitude: 23.7275, population: 664046 },
  { geoname_id: 3186886, city: 'Zagreb', region: null, country: 'Croatia', country_code: 'HR', latitude: 45.815, longitude: 15.9819, population: 804507 },
  { geoname_id: 3190261, city: 'Split', region: null, country: 'Croatia', country_code: 'HR', latitude: 43.5081, longitude: 16.4402, population: 178102 },
  { geoname_id: 3191281, city: 'Dubrovnik', region: null, country: 'Croatia', country_code: 'HR', latitude: 42.6507, longitude: 18.0944, population: 42615 },
  { geoname_id: 792680, city: 'Belgrade', region: null, country: 'Serbia', country_code: 'RS', latitude: 44.7866, longitude: 20.4489, population: 1273651 },
  { geoname_id: 745044, city: 'Istanbul', region: null, country: 'Turkey', country_code: 'TR', latitude: 41.0082, longitude: 28.9784, population: 15029231 },
  { geoname_id: 2964574, city: 'Dublin', region: null, country: 'Ireland', country_code: 'IE', latitude: 53.3498, longitude: -6.2603, population: 1024027 },
  { geoname_id: 2643123, city: 'Manchester', region: 'England', country: 'United Kingdom', country_code: 'GB', latitude: 53.4808, longitude: -2.2426, population: 545500 },
  { geoname_id: 2640729, city: 'Oxford', region: 'England', country: 'United Kingdom', country_code: 'GB', latitude: 51.752, longitude: -1.2577, population: 152450 },
  { geoname_id: 2635167, city: 'Edinburgh', region: 'Scotland', country: 'United Kingdom', country_code: 'GB', latitude: 55.9533, longitude: -3.1883, population: 488050 },
  // Asia & Middle East
  { geoname_id: 1850147, city: 'Tokyo', region: null, country: 'Japan', country_code: 'JP', latitude: 35.6762, longitude: 139.6503, population: 13960000 },
  { geoname_id: 1835848, city: 'Seoul', region: null, country: 'South Korea', country_code: 'KR', latitude: 37.5665, longitude: 126.978, population: 9776000 },
  { geoname_id: 1819729, city: 'Hong Kong', region: null, country: 'Hong Kong', country_code: 'HK', latitude: 22.3193, longitude: 114.1694, population: 7496981 },
  { geoname_id: 1880252, city: 'Singapore', region: null, country: 'Singapore', country_code: 'SG', latitude: 1.3521, longitude: 103.8198, population: 5685807 },
  { geoname_id: 1609350, city: 'Bangkok', region: null, country: 'Thailand', country_code: 'TH', latitude: 13.7563, longitude: 100.5018, population: 8305218 },
  { geoname_id: 1668341, city: 'Taipei', region: null, country: 'Taiwan', country_code: 'TW', latitude: 25.033, longitude: 121.5654, population: 2646204 },
  { geoname_id: 292223, city: 'Dubai', region: null, country: 'United Arab Emirates', country_code: 'AE', latitude: 25.2048, longitude: 55.2708, population: 3331420 },
  { geoname_id: 1275339, city: 'Mumbai', region: 'Maharashtra', country: 'India', country_code: 'IN', latitude: 19.076, longitude: 72.8777, population: 12442373 },
  { geoname_id: 1261481, city: 'New Delhi', region: 'Delhi', country: 'India', country_code: 'IN', latitude: 28.6139, longitude: 77.209, population: 11034555 },
  { geoname_id: 1277333, city: 'Bangalore', region: 'Karnataka', country: 'India', country_code: 'IN', latitude: 12.9716, longitude: 77.5946, population: 8443675 },
  { geoname_id: 1264527, city: 'Chennai', region: 'Tamil Nadu', country: 'India', country_code: 'IN', latitude: 13.0827, longitude: 80.2707, population: 4681087 },
  { geoname_id: 1269843, city: 'Hyderabad', region: 'Telangana', country: 'India', country_code: 'IN', latitude: 17.385, longitude: 78.4867, population: 6809970 },
  { geoname_id: 1273294, city: 'Delhi', region: 'Delhi', country: 'India', country_code: 'IN', latitude: 28.7041, longitude: 77.1025, population: 16787941 },
  { geoname_id: 1275004, city: 'Kolkata', region: 'West Bengal', country: 'India', country_code: 'IN', latitude: 22.5726, longitude: 88.3639, population: 4631392 },
  { geoname_id: 1259229, city: 'Pune', region: 'Maharashtra', country: 'India', country_code: 'IN', latitude: 18.5204, longitude: 73.8567, population: 3124458 },
  { geoname_id: 1279233, city: 'Ahmedabad', region: 'Gujarat', country: 'India', country_code: 'IN', latitude: 23.0225, longitude: 72.5714, population: 5570585 },
  { geoname_id: 1262180, city: 'Jaipur', region: 'Rajasthan', country: 'India', country_code: 'IN', latitude: 26.9124, longitude: 75.7873, population: 3073350 },
  { geoname_id: 1269750, city: 'Goa', region: 'Goa', country: 'India', country_code: 'IN', latitude: 15.2993, longitude: 74.124, population: 818008 },
  { geoname_id: 1256237, city: 'Udaipur', region: 'Rajasthan', country: 'India', country_code: 'IN', latitude: 24.5854, longitude: 73.7125, population: 451735 },
  { geoname_id: 1274746, city: 'Chandigarh', region: 'Chandigarh', country: 'India', country_code: 'IN', latitude: 30.7333, longitude: 76.7794, population: 1055450 },
  { geoname_id: 1275817, city: 'Kochi', region: 'Kerala', country: 'India', country_code: 'IN', latitude: 9.9312, longitude: 76.2673, population: 601574 },
  // Oceania
  { geoname_id: 2147714, city: 'Sydney', region: 'New South Wales', country: 'Australia', country_code: 'AU', latitude: -33.8688, longitude: 151.2093, population: 4627345 },
  { geoname_id: 2158177, city: 'Melbourne', region: 'Victoria', country: 'Australia', country_code: 'AU', latitude: -37.8136, longitude: 144.9631, population: 4529500 },
  // Mexico & Caribbean
  { geoname_id: 3530597, city: 'Mexico City', region: null, country: 'Mexico', country_code: 'MX', latitude: 19.4326, longitude: -99.1332, population: 8918653 },
  { geoname_id: 3521081, city: 'Cancun', region: 'Quintana Roo', country: 'Mexico', country_code: 'MX', latitude: 21.1619, longitude: -86.8515, population: 628306 },
  { geoname_id: 4164138, city: 'Tulum', region: 'Quintana Roo', country: 'Mexico', country_code: 'MX', latitude: 20.2115, longitude: -87.4292, population: 36350 },
  { geoname_id: 3520339, city: 'Puerto Vallarta', region: 'Jalisco', country: 'Mexico', country_code: 'MX', latitude: 20.6534, longitude: -105.2253, population: 275640 },
  { geoname_id: 3514783, city: 'Cabo San Lucas', region: 'Baja California Sur', country: 'Mexico', country_code: 'MX', latitude: 22.8905, longitude: -109.9167, population: 81111 },
  // South America
  { geoname_id: 3451190, city: 'Rio de Janeiro', region: null, country: 'Brazil', country_code: 'BR', latitude: -22.9068, longitude: -43.1729, population: 6748000 },
  { geoname_id: 3448439, city: 'São Paulo', region: null, country: 'Brazil', country_code: 'BR', latitude: -23.5505, longitude: -46.6333, population: 12330000 },
  { geoname_id: 3871336, city: 'Santiago', region: null, country: 'Chile', country_code: 'CL', latitude: -33.4489, longitude: -70.6693, population: 5614000 },
  { geoname_id: 3435910, city: 'Buenos Aires', region: null, country: 'Argentina', country_code: 'AR', latitude: -34.6037, longitude: -58.3816, population: 2891000 },
  // Africa
  { geoname_id: 3369157, city: 'Cape Town', region: null, country: 'South Africa', country_code: 'ZA', latitude: -33.9249, longitude: 18.4241, population: 433688 },
  { geoname_id: 184745, city: 'Nairobi', region: null, country: 'Kenya', country_code: 'KE', latitude: -1.2921, longitude: 36.8219, population: 4397073 },
  { geoname_id: 360630, city: 'Cairo', region: null, country: 'Egypt', country_code: 'EG', latitude: 30.0444, longitude: 31.2357, population: 9120000 },
  { geoname_id: 2538474, city: 'Marrakech', region: null, country: 'Morocco', country_code: 'MA', latitude: 31.6295, longitude: -7.9811, population: 928850 },
  // Popular wedding destinations
  { geoname_id: 1252431, city: 'Bali', region: null, country: 'Indonesia', country_code: 'ID', latitude: -8.3405, longitude: 115.092, population: 4225000 },
  { geoname_id: 3573197, city: 'Turks and Caicos', region: null, country: 'Turks and Caicos Islands', country_code: 'TC', latitude: 21.694, longitude: -71.7979, population: 31458 },
  { geoname_id: 1282988, city: 'Santorini', region: null, country: 'Greece', country_code: 'GR', latitude: 36.3932, longitude: 25.4615, population: 15550 },
  { geoname_id: 3042091, city: 'Amalfi', region: 'Campania', country: 'Italy', country_code: 'IT', latitude: 40.634, longitude: 14.6027, population: 5145 },
  { geoname_id: 3042091, city: 'Positano', region: 'Campania', country: 'Italy', country_code: 'IT', latitude: 40.6281, longitude: 14.4849, population: 3942 },
  { geoname_id: 2993458, city: 'Nice', region: "Provence-Alpes-Côte d'Azur", country: 'France', country_code: 'FR', latitude: 43.7102, longitude: 7.262, population: 342522 },
  { geoname_id: 3023140, city: 'Cannes', region: "Provence-Alpes-Côte d'Azur", country: 'France', country_code: 'FR', latitude: 43.5528, longitude: 7.0174, population: 74152 },
  { geoname_id: 2660677, city: 'Lake Como', region: 'Lombardy', country: 'Italy', country_code: 'IT', latitude: 45.9944, longitude: 9.2574, population: 83000 },
  { geoname_id: 1282027, city: 'Napa Valley', region: 'California', country: 'United States', country_code: 'US', latitude: 38.5025, longitude: -122.2654, population: 79700 },
  { geoname_id: 2661552, city: 'Tuscany', region: null, country: 'Italy', country_code: 'IT', latitude: 43.7711, longitude: 11.2486, population: 3729641 },
  { geoname_id: 3573374, city: 'Barbados', region: null, country: 'Barbados', country_code: 'BB', latitude: 13.1939, longitude: -59.5432, population: 287025 },
  { geoname_id: 3489854, city: 'Jamaica', region: null, country: 'Jamaica', country_code: 'JM', latitude: 18.1096, longitude: -77.2975, population: 2961161 },
  { geoname_id: 3580733, city: 'Aruba', region: null, country: 'Aruba', country_code: 'AW', latitude: 12.5211, longitude: -69.9683, population: 106766 },
  { geoname_id: 3577154, city: 'Punta Cana', region: null, country: 'Dominican Republic', country_code: 'DO', latitude: 18.5601, longitude: -68.3725, population: 100023 },
];

function searchBuiltinCities(query: string): CityEntry[] {
  const q = query.toLowerCase();
  // Score matches: startsWith gets priority over includes
  return BUILTIN_CITIES
    .filter((c) =>
      c.city.toLowerCase().includes(q) ||
      (c.region && c.region.toLowerCase().includes(q))
    )
    .sort((a, b) => {
      const aStartsWith = a.city.toLowerCase().startsWith(q) ? 1 : 0;
      const bStartsWith = b.city.toLowerCase().startsWith(q) ? 1 : 0;
      if (aStartsWith !== bStartsWith) return bStartsWith - aStartsWith;
      return b.population - a.population;
    })
    .slice(0, 8);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return Response.json({ data: { cities: [] } });
  }

  // Try GeoNames first if configured
  const username = env.GEONAMES_USERNAME;
  if (username) {
    try {
      const params = new URLSearchParams({
        name_startsWith: q,
        featureClass: 'P',
        maxRows: '8',
        orderby: 'population',
        style: 'LONG',
        username,
      });

      const res = await fetch(
        `https://secure.geonames.org/searchJSON?${params}`,
        { next: { revalidate: 3600 } }
      );

      if (res.ok) {
        const data = await res.json();
        const cities = (data.geonames || []).map((g: GeoNamesResult) => ({
          geoname_id: g.geonameId,
          city: g.name,
          region: g.adminName1 || null,
          country: g.countryName,
          country_code: g.countryCode,
          latitude: parseFloat(g.lat),
          longitude: parseFloat(g.lng),
          population: g.population,
        }));
        return Response.json({ data: { cities } });
      }
    } catch (err) {
      console.error('GeoNames search error, falling back to built-in:', err);
    }
  }

  // Fallback to built-in city list
  const cities = searchBuiltinCities(q);
  return Response.json({ data: { cities } });
}
