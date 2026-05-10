import { useDispatch, useSelector } from 'react-redux'

import Toast from 'react-bootstrap/Toast'
import ToastContainer from 'react-bootstrap/ToastContainer'

import { removeToast } from '../store/reducers/toasts'

const ToastDisplay = () => {
  const dispatch = useDispatch()
  const items = useSelector((state) => state.toasts.items)

  const lightText = (variant) => variant === 'success' || variant === 'danger' || variant === 'dark'

  return (
    <ToastContainer position='bottom-end' className='p-3 position-fixed' style={{ zIndex: 1100 }}>
      {items.map(t => (
        <Toast
          key={t.id}
          bg={t.variant}
          onClose={() => dispatch(removeToast(t.id))}
          autohide
          delay={t.delay}
        >
          <Toast.Body className={lightText(t.variant) ? 'text-white' : ''}>
            {t.message}
          </Toast.Body>
        </Toast>
      ))}
    </ToastContainer>
  )
}

export default ToastDisplay
