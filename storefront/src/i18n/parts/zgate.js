// Ordering needs a website account (registered with email): the login note, the cart hint and the required email at checkout.
export default {
  id: {
    gate: {
      cart_note: 'Untuk checkout, silakan login atau daftar dengan email dulu.',
      login_note: 'Daftar / login dengan email dulu untuk melanjutkan checkout. Setelah itu kamu langsung kembali ke checkout.',
    },
    co: { err_email: 'Email wajib diisi dengan format yang benar', err_email_li: 'Email: wajib diisi, format benar' },
  },
  en: {
    gate: {
      cart_note: 'Please log in or register with your email to check out.',
      login_note: 'Register / log in with your email to continue to checkout. You will come straight back to checkout.',
    },
    co: { err_email: 'Enter a valid email address (required)', err_email_li: 'Email: required, valid format' },
  },
  zh: {
    gate: {
      cart_note: '結帳前請先使用 Email 登入或註冊。',
      login_note: '請先使用 Email 註冊 / 登入才能繼續結帳，完成後會直接回到結帳頁。',
    },
    co: { err_email: '請填寫正確的 Email（必填）', err_email_li: 'Email：必填，格式正確' },
  },
}
