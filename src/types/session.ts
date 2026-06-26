export interface SessionData {
  step: 
    | 'idle' 
    | 'input_name' 
    | 'input_phone' 
    | 'admin_password' 
    | 'admin_edit_master_field'
    | 'admin_edit_client_field'
    | 'admin_add_master_name'
    | 'admin_add_master_hours'
    | 'admin_add_service_name'
    | 'admin_add_service_duration'
    | 'admin_add_service_price'
    | 'admin_edit_service_field'
    | 'admin_edit_master_wh_custom'
    | 'admin_edit_salon_field'
    | 'admin_edit_salon_wh_custom'
    | 'client_edit_firstname'
    | 'client_edit_lastname'
    | 'client_edit_phone'
    | 'admin_add_portfolio_media'
    | 'admin_add_portfolio_desc';
  booking?: {
    serviceId?: string;
    masterId?: string;
    date?: string; // YYYY-MM-DD
    time?: string; // HH:MM
  };
  clientForm?: {
    name?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  adminState?: {
    selectedMasterId?: string;
    selectedClientId?: string;
    selectedServiceId?: string;
    selectedAppointmentId?: string;
    rescheduleDate?: string; // YYYY-MM-DD
    promptMessageId?: number; // ID сообщения-подсказки для удаления
    fieldToEdit?: 'name' | 'phone' | 'workingHours' | 'photoUrl' | 'services' | 'isBlocked' | 'durationMinutes' | 'priceRub' | 'address' | 'howToGet' | 'rules';
    newServiceForm?: {
      name?: string;
      durationMinutes?: number;
      priceRub?: number;
    };
    newPortfolioForm?: {
      fileId?: string;
      mediaType?: 'photo' | 'video';
      description?: string;
      masterId?: string;
    };
    newPortfolioMediaBatch?: {
      fileId: string;
      mediaType: 'photo' | 'video';
    }[];
    editingDay?: string;
    whCardMessageId?: number;
  };
}
